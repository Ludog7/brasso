import { createHash, createHmac } from "node:crypto";

import type { ExternalProviderKind } from "@brasso/db";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import type {
  ReconciliationRepository,
  SaleTransactionRecord,
} from "../src/modules/reconciliation/repository.js";
import { ReconciliationService } from "../src/modules/reconciliation/service.js";
import type {
  ExternalTransactionInsert,
  WebhookProviderRecord,
  WebhookRepository,
} from "../src/modules/webhooks/repository.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";

/**
 * Rapprochement vente→stock (M7-05, cœur démo M7). Un `store` en mémoire implémente
 * **à la fois** `WebhookRepository` (ingestion M7-03) et `ReconciliationRepository`
 * (rapprochement) pour prouver la démo bout-en-bout : vente SumUp signée → mouvement
 * de stock `SALE` (mappée) ou anomalie `UNMAPPED_TRANSACTION` (mode dégradé).
 */

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const SUMUP_SECRET_REF = "SUMUP_WEBHOOK_SECRET";
const SUMUP_SECRET = "sumup-hmac-key";
const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");
const sign = (secret: string, raw: string): string =>
  createHmac("sha256", secret).update(raw).digest("hex");

interface StoredTx {
  id: string;
  providerId: string;
  externalId: string;
  kind: SaleTransactionRecord["kind"];
  externalProductId: string | null;
  status: SaleTransactionRecord["status"];
  occurredAt: Date;
}
interface StoredMovement {
  id: string;
  catalogItemId: string;
  delta: number;
  reason: string;
  externalTransactionId: string;
}
interface StoredAlert {
  id: string;
  type: string;
  status: "OPEN" | "RESOLVED";
  message: string;
  providerId: string;
  transactionId: string;
  resolvedAt: Date | null;
}

/** Store partagé ingestion + rapprochement (état inspectable dans les tests). */
class InMemoryStore implements WebhookRepository, ReconciliationRepository {
  readonly providers: WebhookProviderRecord[] = [];
  readonly transactions: StoredTx[] = [];
  readonly mappings: {
    providerId: string;
    externalProductId: string;
    catalogItemId: string | null;
  }[] = [];
  readonly movements: StoredMovement[] = [];
  readonly alerts: StoredAlert[] = [];
  /** Simule une panne du rapprochement (test best-effort). */
  failReconcile = false;
  private seq = 0;

  seedProvider(
    kind: ExternalProviderKind,
    label: string,
    secretRef: string,
  ): WebhookProviderRecord {
    const provider: WebhookProviderRecord = {
      id: `p-${kind.toLowerCase()}`,
      kind,
      label,
      webhookSecretRef: secretRef,
      isActive: true,
    };
    this.providers.push(provider);
    return provider;
  }
  seedMapping(providerId: string, externalProductId: string, catalogItemId: string | null): void {
    this.mappings.push({ providerId, externalProductId, catalogItemId });
  }
  seedTransaction(t: Partial<StoredTx> & { id: string; providerId: string }): StoredTx {
    const row: StoredTx = {
      externalId: `ext-${t.id}`,
      kind: "SALE",
      externalProductId: "SUMUP-PROD-BLONDE",
      status: "UNMAPPED",
      occurredAt: new Date("2026-07-16T10:00:00Z"),
      ...t,
    };
    this.transactions.push(row);
    return row;
  }
  seedAlert(providerId: string, transactionId: string): StoredAlert {
    const alert: StoredAlert = {
      id: `al${++this.seq}`,
      type: "UNMAPPED_TRANSACTION",
      status: "OPEN",
      message: "seed",
      providerId,
      transactionId,
      resolvedAt: null,
    };
    this.alerts.push(alert);
    return alert;
  }

  // ── WebhookRepository ──
  findActiveProvider(kind: ExternalProviderKind): Promise<WebhookProviderRecord | null> {
    return Promise.resolve(this.providers.find((p) => p.kind === kind && p.isActive) ?? null);
  }
  findTransaction(providerId: string, externalId: string): Promise<{ id: string } | null> {
    const t = this.transactions.find(
      (x) => x.providerId === providerId && x.externalId === externalId,
    );
    return Promise.resolve(t ? { id: t.id } : null);
  }
  insertTransaction(data: ExternalTransactionInsert): Promise<{ id: string }> {
    const row: StoredTx = {
      id: `t${++this.seq}`,
      providerId: data.providerId,
      externalId: data.externalId,
      kind: data.kind,
      externalProductId: data.externalProductId,
      status: "UNMAPPED",
      occurredAt: data.occurredAt,
    };
    this.transactions.push(row);
    return Promise.resolve({ id: row.id });
  }

  // ── ReconciliationRepository ──
  getSaleTransaction(id: string): Promise<SaleTransactionRecord | null> {
    if (this.failReconcile) {
      return Promise.reject(new Error("panne simulée du rapprochement"));
    }
    const tx = this.transactions.find((t) => t.id === id);
    if (!tx) return Promise.resolve(null);
    const label = this.providers.find((p) => p.id === tx.providerId)?.label ?? "?";
    return Promise.resolve({
      id: tx.id,
      providerId: tx.providerId,
      providerLabel: label,
      externalProductId: tx.externalProductId,
      kind: tx.kind,
      status: tx.status,
      occurredAt: tx.occurredAt,
    });
  }
  findMapping(
    providerId: string,
    externalProductId: string,
  ): Promise<{ catalogItemId: string | null } | null> {
    const m = this.mappings.find(
      (x) => x.providerId === providerId && x.externalProductId === externalProductId,
    );
    return Promise.resolve(m ? { catalogItemId: m.catalogItemId } : null);
  }
  hasSaleMovement(transactionId: string): Promise<boolean> {
    return Promise.resolve(
      this.movements.some((m) => m.externalTransactionId === transactionId && m.reason === "SALE"),
    );
  }
  findOpenUnmappedAlert(transactionId: string): Promise<{ id: string } | null> {
    const a = this.alerts.find(
      (x) =>
        x.transactionId === transactionId &&
        x.type === "UNMAPPED_TRANSACTION" &&
        x.status === "OPEN",
    );
    return Promise.resolve(a ? { id: a.id } : null);
  }
  applySaleMovement(input: {
    transactionId: string;
    catalogItemId: string;
    delta: number;
  }): Promise<{ movementId: string }> {
    const movement: StoredMovement = {
      id: `mv${++this.seq}`,
      catalogItemId: input.catalogItemId,
      delta: input.delta,
      reason: "SALE",
      externalTransactionId: input.transactionId,
    };
    this.movements.push(movement);
    const tx = this.transactions.find((t) => t.id === input.transactionId);
    if (tx) tx.status = "MAPPED";
    return Promise.resolve({ movementId: movement.id });
  }
  createUnmappedAlert(input: {
    providerId: string;
    transactionId: string;
    message: string;
  }): Promise<{ id: string }> {
    const alert: StoredAlert = {
      id: `al${++this.seq}`,
      type: "UNMAPPED_TRANSACTION",
      status: "OPEN",
      message: input.message,
      providerId: input.providerId,
      transactionId: input.transactionId,
      resolvedAt: null,
    };
    this.alerts.push(alert);
    return Promise.resolve({ id: alert.id });
  }
  resolveUnmappedAlerts(transactionId: string): Promise<number> {
    let count = 0;
    for (const a of this.alerts) {
      if (
        a.transactionId === transactionId &&
        a.type === "UNMAPPED_TRANSACTION" &&
        a.status === "OPEN"
      ) {
        a.status = "RESOLVED";
        a.resolvedAt = new Date();
        count++;
      }
    }
    return Promise.resolve(count);
  }
}

const sumUpPayload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  event_type: "transaction.updated",
  transaction: {
    id: "SUMUP-TX-1",
    amount: 4.5,
    currency: "EUR",
    timestamp: "2026-07-16T10:00:00.000Z",
    payment_type: "POS",
    products: [{ id: "SKU-BLONDE-33", name: "Blonde 33cl" }],
    ...over,
  },
});

// ── Démo bout-en-bout : webhook SumUp → rapprochement ────────────────────────

describe("démo M7 : vente SumUp → stock / anomalie (bout en bout)", () => {
  let store: InMemoryStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    store = new InMemoryStore();
    store.seedProvider("SUMUP", "SumUp", SUMUP_SECRET_REF);
    app = await buildApp({
      config,
      webhookRepository: store,
      reconciliationRepository: store,
      webhookSecretResolver: (ref) => (ref === SUMUP_SECRET_REF ? SUMUP_SECRET : undefined),
    });
    await app.ready();
  });

  function postSale(over: Record<string, unknown> = {}): ReturnType<FastifyInstance["inject"]> {
    const raw = JSON.stringify(sumUpPayload(over));
    return app.inject({
      method: "POST",
      url: "/webhooks/sumup",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": sign(SUMUP_SECRET, raw),
      },
      payload: raw,
    });
  }

  it("vente mappée → mouvement SALE (delta<0, lié) + transaction MAPPED", async () => {
    store.seedMapping("p-sumup", "SKU-BLONDE-33", "cat-blonde");
    const res = await postSale();

    expect(res.statusCode).toBe(201);
    expect(store.movements).toHaveLength(1);
    const mv = store.movements[0]!;
    expect(mv).toMatchObject({
      catalogItemId: "cat-blonde",
      delta: -1,
      reason: "SALE",
    });
    expect(mv.externalTransactionId).toBe(store.transactions[0]!.id);
    expect(store.transactions[0]!.status).toBe("MAPPED");
    expect(store.alerts).toHaveLength(0);
  });

  it("vente non mappée → anomalie UNMAPPED_TRANSACTION, AUCUN mouvement, transaction UNMAPPED", async () => {
    const res = await postSale();

    expect(res.statusCode).toBe(201);
    expect(store.movements).toHaveLength(0);
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0]).toMatchObject({
      type: "UNMAPPED_TRANSACTION",
      status: "OPEN",
      providerId: "p-sumup",
      transactionId: store.transactions[0]!.id,
    });
    expect(store.alerts[0]!.message).toContain("SumUp");
    expect(store.transactions[0]!.status).toBe("UNMAPPED");
  });

  it("mapping incomplet (catalogItemId null) → mode dégradé (anomalie, pas de mouvement)", async () => {
    store.seedMapping("p-sumup", "SKU-BLONDE-33", null);
    const res = await postSale();

    expect(res.statusCode).toBe(201);
    expect(store.movements).toHaveLength(0);
    expect(store.alerts).toHaveLength(1);
  });

  it("vente sans externalProductId → anomalie, pas de mouvement", async () => {
    const res = await postSale({ products: [] });

    expect(res.statusCode).toBe(201);
    expect(store.transactions[0]!.externalProductId).toBeNull();
    expect(store.movements).toHaveLength(0);
    expect(store.alerts).toHaveLength(1);
  });

  it("une panne du rapprochement ne casse PAS l'ingestion (best-effort)", async () => {
    store.failReconcile = true;
    const res = await postSale();

    expect(res.statusCode).toBe(201); // vente ingérée malgré l'échec du post-traitement
    expect(store.transactions).toHaveLength(1);
    expect(store.movements).toHaveLength(0);
    expect(store.alerts).toHaveLength(0);
  });
});

// ── Idempotence (service) ────────────────────────────────────────────────────

describe("idempotence du rapprochement (M7-05)", () => {
  let store: InMemoryStore;
  let service: ReconciliationService;

  beforeEach(() => {
    store = new InMemoryStore();
    store.seedProvider("SUMUP", "SumUp", SUMUP_SECRET_REF);
    service = new ReconciliationService(store);
  });

  it("vente mappée rejouée → un seul mouvement (2e appel = already_mapped)", async () => {
    store.seedMapping("p-sumup", "SUMUP-PROD-BLONDE", "cat-blonde");
    const tx = store.seedTransaction({ id: "x1", providerId: "p-sumup" });

    const first = await service.reconcileSale(tx.id);
    const second = await service.reconcileSale(tx.id);

    expect(first.status).toBe("mapped");
    expect(second.status).toBe("already_mapped");
    expect(store.movements).toHaveLength(1);
  });

  it("vente non mappée rejouée → une seule anomalie ouverte", async () => {
    const tx = store.seedTransaction({ id: "x2", providerId: "p-sumup" });

    const first = await service.reconcileSale(tx.id);
    const second = await service.reconcileSale(tx.id);

    expect(first.status).toBe("unmapped");
    expect(second.status).toBe("unmapped");
    expect(store.alerts).toHaveLength(1);
  });

  it("transaction absente ou non-SALE → skipped (best-effort silencieux)", async () => {
    expect((await service.reconcileSale("ghost")).status).toBe("skipped");
    const memb = store.seedTransaction({ id: "m1", providerId: "p-sumup", kind: "MEMBERSHIP" });
    expect((await service.reconcileSale(memb.id)).status).toBe("skipped");
    expect(store.movements).toHaveLength(0);
  });
});

// ── Re-traitement manuel POST /transactions/:id/reprocess (RBAC) ─────────────

class InMemoryAuthRepository implements AuthRepository {
  private byId = new Map<string, AuthUserRecord>();
  private sessions = new Map<string, SessionRecord>();
  addUser(u: AuthUserRecord): void {
    this.byId.set(u.id, u);
  }
  addSession(s: SessionRecord): void {
    this.sessions.set(s.tokenHash, s);
  }
  findUserByEmail(): Promise<AuthUserRecord | null> {
    return Promise.resolve(null);
  }
  findUserById(id: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  createSession(s: SessionRecord): Promise<void> {
    this.sessions.set(s.tokenHash, s);
    return Promise.resolve();
  }
  findSessionByTokenHash(h: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(h) ?? null);
  }
  deleteSession(h: string): Promise<void> {
    this.sessions.delete(h);
    return Promise.resolve();
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

describe("POST /transactions/:id/reprocess (M7-05)", () => {
  let store: InMemoryStore;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    store = new InMemoryStore();
    store.seedProvider("SUMUP", "SumUp", SUMUP_SECRET_REF);
    const auth = new InMemoryAuthRepository();
    const future = new Date(Date.now() + 3_600_000);
    for (const [id, roles] of Object.entries(USERS)) {
      auth.addUser({
        id,
        email: `${id}@brasso.test`,
        displayName: id,
        passwordHash: "x",
        isActive: true,
        roles,
      });
      auth.addSession({ tokenHash: sha256(`tok_${id}`), userId: id, expiresAt: future });
    }
    app = await buildApp({ config, authRepository: auth, reconciliationRepository: store });
    await app.ready();
    cookieFor = (user) => app.signCookie(`tok_${user}`);
  });

  function reprocess(id: string, user: string): ReturnType<FastifyInstance["inject"]> {
    return app.inject({
      method: "POST",
      url: `/api/transactions/${id}/reprocess`,
      cookies: { [SESSION_COOKIE]: cookieFor(user) },
    });
  }

  it("après création d'un mapping → mouvement + transaction MAPPED + anomalie résolue", async () => {
    const tx = store.seedTransaction({ id: "r1", providerId: "p-sumup" });
    store.seedAlert("p-sumup", tx.id); // anomalie ouverte issue de l'ingestion initiale
    store.seedMapping("p-sumup", "SUMUP-PROD-BLONDE", "cat-blonde"); // mapping créé entre-temps

    const res = await reprocess(tx.id, "caisse");
    expect(res.statusCode).toBe(200);
    expect((res.json() as { result: { status: string } }).result.status).toBe("mapped");
    expect(store.movements).toHaveLength(1);
    expect(store.transactions[0]!.status).toBe("MAPPED");
    expect(store.alerts[0]!.status).toBe("RESOLVED");
  });

  it("transaction absente → 404 ; déjà MAPPED → no-op already_mapped", async () => {
    const missing = await reprocess("ghost", "caisse");
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("TRANSACTION_NOT_FOUND");

    const mapped = store.seedTransaction({ id: "r2", providerId: "p-sumup", status: "MAPPED" });
    const noop = await reprocess(mapped.id, "caisse");
    expect(noop.statusCode).toBe(200);
    expect((noop.json() as { result: { status: string } }).result.status).toBe("already_mapped");
    expect(store.movements).toHaveLength(0);
  });

  it("RBAC : reprocess sous mapping:update (caisse/admin oui ; brasseur/rgpd 403)", async () => {
    store.seedTransaction({ id: "r3", providerId: "p-sumup" });
    for (const role of ["caisse", "admin"]) {
      expect((await reprocess("r3", role)).statusCode).not.toBe(403);
    }
    for (const role of ["brasseur", "rgpd"]) {
      expect((await reprocess("r3", role)).statusCode).toBe(403);
    }
  });
});
