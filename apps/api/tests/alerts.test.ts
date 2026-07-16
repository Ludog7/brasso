import { createHash, createHmac } from "node:crypto";

import type { ExternalProviderKind, IntegrationAlertType } from "@brasso/db";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AlertListFilters,
  AlertRecord,
  AlertRepository,
  StockAdjustment,
} from "../src/modules/alerts/repository.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import type {
  ExternalTransactionInsert,
  WebhookProviderRecord,
  WebhookRepository,
} from "../src/modules/webhooks/repository.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");
const sign = (secret: string, raw: string): string =>
  createHmac("sha256", secret).update(raw).digest("hex");

// ── Repositories mémoire ────────────────────────────────────────────────────

interface StoredMovement {
  catalogItemId: string;
  delta: number;
  reason: string;
  note: string | null;
  userId: string | null;
}

class InMemoryAlertRepository implements AlertRepository {
  readonly alerts: AlertRecord[] = [];
  readonly movements: StoredMovement[] = [];
  private seq = 0;

  seed(partial: Partial<AlertRecord> = {}): AlertRecord {
    const alert: AlertRecord = {
      id: `al${++this.seq}`,
      type: "UNMAPPED_TRANSACTION",
      status: "OPEN",
      message: "1 vente non identifiée sur SumUp le 16/07 — ajustement manuel du stock requis",
      providerId: "p-sumup",
      provider: { label: "SumUp" },
      transactionId: "tx1",
      transaction: {
        amountCents: 450,
        currency: "EUR",
        occurredAt: new Date("2026-07-16T10:00:00Z"),
        externalProductId: "SKU-BLONDE-33",
      },
      createdAt: new Date(),
      resolvedAt: null,
      ...partial,
    };
    this.alerts.push(alert);
    return alert;
  }

  list(filters: AlertListFilters): Promise<{ alerts: AlertRecord[]; total: number }> {
    let rows = [...this.alerts];
    if (filters.status !== undefined) rows = rows.filter((a) => a.status === filters.status);
    if (filters.type !== undefined) rows = rows.filter((a) => a.type === filters.type);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve({
      alerts: rows.slice(filters.offset, filters.offset + filters.limit),
      total: rows.length,
    });
  }
  findById(id: string): Promise<AlertRecord | null> {
    return Promise.resolve(this.alerts.find((a) => a.id === id) ?? null);
  }
  resolve(
    id: string,
    adjustment: StockAdjustment | null,
    userId: string | null,
  ): Promise<AlertRecord> {
    if (adjustment) {
      this.movements.push({
        catalogItemId: adjustment.catalogItemId,
        delta: adjustment.delta,
        reason: "ADJUSTMENT",
        note: adjustment.note ?? null,
        userId,
      });
    }
    const alert = this.alerts.find((a) => a.id === id)!;
    alert.status = "RESOLVED";
    alert.resolvedAt = new Date();
    return Promise.resolve(alert);
  }
  createWebhookFailure(providerId: string, message: string): Promise<{ id: string }> {
    const alert = this.seed({
      type: "WEBHOOK_FAILURE",
      status: "OPEN",
      message,
      providerId,
      provider: { label: "SumUp" },
      transactionId: null,
      transaction: null,
    });
    return Promise.resolve({ id: alert.id });
  }
}

class InMemoryWebhookRepository implements WebhookRepository {
  readonly transactions: ExternalTransactionInsert[] = [];
  constructor(private readonly provider: WebhookProviderRecord) {}
  findActiveProvider(kind: ExternalProviderKind): Promise<WebhookProviderRecord | null> {
    return Promise.resolve(this.provider.kind === kind ? this.provider : null);
  }
  findTransaction(): Promise<{ id: string } | null> {
    return Promise.resolve(null);
  }
  insertTransaction(data: ExternalTransactionInsert): Promise<{ id: string }> {
    this.transactions.push(data);
    return Promise.resolve({ id: `t${this.transactions.length}` });
  }
}

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

function seedAuth(): InMemoryAuthRepository {
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
  return auth;
}

// ── Lecture & résolution ─────────────────────────────────────────────────────

describe("dashboard des anomalies : lecture & résolution (M7-06)", () => {
  let alerts: InMemoryAlertRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    alerts = new InMemoryAlertRepository();
    app = await buildApp({ config, authRepository: seedAuth(), alertRepository: alerts });
    await app.ready();
    cookieFor = (user) => app.signCookie(`tok_${user}`);
  });

  function req(
    method: string,
    url: string,
    user: string | undefined,
    payload?: unknown,
  ): ReturnType<FastifyInstance["inject"]> {
    return app.inject({
      method: method as "GET",
      url,
      ...(user ? { cookies: { [SESSION_COOKIE]: cookieFor(user) } } : {}),
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  it("liste filtrée par status/type + contexte (provider, transaction) sans exposer d'interne", async () => {
    alerts.seed(); // UNMAPPED_TRANSACTION OPEN
    alerts.seed({ status: "RESOLVED", resolvedAt: new Date() });
    alerts.seed({ type: "WEBHOOK_FAILURE", transactionId: null, transaction: null });

    const open = await req("GET", "/api/alerts?status=OPEN", "caisse");
    expect(open.statusCode).toBe(200);
    const body = open.json() as { alerts: AlertRecord[]; total: number };
    expect(body.total).toBe(2); // 2 ouvertes
    expect(body.alerts[0]?.provider?.label).toBe("SumUp");

    const unmapped = await req("GET", "/api/alerts?type=UNMAPPED_TRANSACTION", "caisse");
    expect((unmapped.json() as { total: number }).total).toBe(2);
    expect(
      (unmapped.json() as { alerts: AlertRecord[] }).alerts[0]?.transaction?.externalProductId,
    ).toBe("SKU-BLONDE-33");
  });

  it("détail d'une anomalie ; 404 si absente", async () => {
    const seeded = alerts.seed();
    const ok = await req("GET", `/api/alerts/${seeded.id}`, "caisse");
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { alert: AlertRecord }).alert.id).toBe(seeded.id);

    const missing = await req("GET", "/api/alerts/ghost", "caisse");
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("ALERT_NOT_FOUND");
  });

  it("résout sans ajustement → RESOLVED, aucun mouvement", async () => {
    const seeded = alerts.seed();
    const res = await req("POST", `/api/alerts/${seeded.id}/resolve`, "caisse", {});
    expect(res.statusCode).toBe(200);
    expect((res.json() as { alert: AlertRecord }).alert.status).toBe("RESOLVED");
    expect(alerts.movements).toHaveLength(0);
  });

  it("résout avec ajustement → StockMovement ADJUSTMENT (registre M5) + RESOLVED", async () => {
    const seeded = alerts.seed();
    const res = await req("POST", `/api/alerts/${seeded.id}/resolve`, "caisse", {
      stockAdjustment: {
        catalogItemId: "cat-blonde",
        delta: -1,
        note: "vente non mappée compensée",
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { alert: AlertRecord }).alert.status).toBe("RESOLVED");
    expect(alerts.movements).toHaveLength(1);
    expect(alerts.movements[0]).toMatchObject({
      catalogItemId: "cat-blonde",
      delta: -1,
      reason: "ADJUSTMENT",
      userId: "caisse",
    });
  });

  it("résolution idempotente : anomalie déjà RESOLVED → no-op, pas de nouveau mouvement", async () => {
    const seeded = alerts.seed({ status: "RESOLVED", resolvedAt: new Date() });
    const res = await req("POST", `/api/alerts/${seeded.id}/resolve`, "caisse", {
      stockAdjustment: { catalogItemId: "cat-blonde", delta: -1 },
    });
    expect(res.statusCode).toBe(200);
    expect(alerts.movements).toHaveLength(0); // pas de mouvement sur une anomalie déjà résolue
  });

  it("rejette un delta d'ajustement nul → 400", async () => {
    const seeded = alerts.seed();
    const res = await req("POST", `/api/alerts/${seeded.id}/resolve`, "caisse", {
      stockAdjustment: { catalogItemId: "cat-blonde", delta: 0 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("RBAC : lecture caisse/brasseur/admin ; résolution caisse/admin (brasseur/rgpd refusés)", async () => {
    const seeded = alerts.seed();
    // Lecture : admin/brasseur/caisse oui, rgpd non.
    for (const role of ["admin", "brasseur", "caisse"]) {
      expect((await req("GET", "/api/alerts", role)).statusCode).toBe(200);
    }
    expect((await req("GET", "/api/alerts", "rgpd")).statusCode).toBe(403);

    // Résolution (mapping:update) : caisse/admin oui ; brasseur/rgpd non.
    for (const role of ["caisse", "admin"]) {
      expect((await req("POST", `/api/alerts/${seeded.id}/resolve`, role, {})).statusCode).not.toBe(
        403,
      );
    }
    for (const role of ["brasseur", "rgpd"]) {
      expect((await req("POST", `/api/alerts/${seeded.id}/resolve`, role, {})).statusCode).toBe(
        403,
      );
    }
  });
});

// ── Émission WEBHOOK_FAILURE ─────────────────────────────────────────────────

describe("émission WEBHOOK_FAILURE sur échec d'ingestion (M7-06)", () => {
  const SECRET_REF = "SUMUP_WEBHOOK_SECRET";
  const SECRET = "sumup-hmac-key";
  let alerts: InMemoryAlertRepository;
  let app: FastifyInstance;

  beforeEach(async () => {
    alerts = new InMemoryAlertRepository();
    const provider: WebhookProviderRecord = {
      id: "p-sumup",
      kind: "SUMUP",
      label: "SumUp",
      webhookSecretRef: SECRET_REF,
      isActive: true,
    };
    app = await buildApp({
      config,
      webhookRepository: new InMemoryWebhookRepository(provider),
      alertRepository: alerts,
      webhookSecretResolver: (ref) => (ref === SECRET_REF ? SECRET : undefined),
    });
    await app.ready();
  });

  function postSumUp(raw: string, signature: string): ReturnType<FastifyInstance["inject"]> {
    return app.inject({
      method: "POST",
      url: "/webhooks/sumup",
      headers: { "content-type": "application/json", "x-webhook-signature": signature },
      payload: raw,
    });
  }

  it("échec POST-signature (payload signé mais invalide) → anomalie WEBHOOK_FAILURE + 400", async () => {
    // JSON signable mais sans `transaction.id` requis → normalisation Zod échoue.
    const raw = JSON.stringify({ transaction: { amount: 4.5, timestamp: "2026-07-16T10:00:00Z" } });
    const res = await postSumUp(raw, sign(SECRET, raw));

    expect(res.statusCode).toBe(400);
    const failures = alerts.alerts.filter(
      (a) => a.type === ("WEBHOOK_FAILURE" as IntegrationAlertType),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ providerId: "p-sumup", status: "OPEN" });
  });

  it("échec de SIGNATURE → 401 SANS anomalie (bruit/attaques ne polluent pas le dashboard)", async () => {
    const raw = JSON.stringify({
      transaction: { id: "TX", amount: 4.5, timestamp: "2026-07-16T10:00:00Z" },
    });
    const res = await postSumUp(raw, "deadbeef");

    expect(res.statusCode).toBe(401);
    expect(alerts.alerts).toHaveLength(0);
  });
});
