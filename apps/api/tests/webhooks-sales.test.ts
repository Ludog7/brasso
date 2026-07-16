import { createHmac } from "node:crypto";

import type { ExternalProviderKind, ExternalTransactionKind } from "@brasso/db";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { TransactionRepository } from "../src/modules/transactions/repository.js";
import type {
  ExternalTransactionInsert,
  WebhookProviderRecord,
  WebhookRepository,
} from "../src/modules/webhooks/repository.js";
import type { SecretResolver } from "../src/modules/webhooks/service.js";

/**
 * Tests d'intégration des webhooks de vente **SumUp / Zettle** (M7-03). Vérifient
 * la réutilisation de la fondation M6-07 (signature = auth, idempotence, append-only)
 * et la **normalisation SALE propre à chaque provider** (SumUp en euros décimaux →
 * centimes ; Zettle déjà en centimes ; `externalProductId` extrait du panier).
 */

/** Repo transactions no-op : sales n'appellent jamais l'auto-rapprochement (M6-08). */
class NoopTransactionRepository implements TransactionRepository {
  findById(): Promise<null> {
    return Promise.resolve(null);
  }
  list(): Promise<{ transactions: []; total: number }> {
    return Promise.resolve({ transactions: [], total: 0 });
  }
  getMemberById(): Promise<null> {
    return Promise.resolve(null);
  }
  findMembersByNormalizedEmail(): Promise<[]> {
    return Promise.resolve([]);
  }
  membershipPeriodDays(): Promise<number> {
    return Promise.resolve(365);
  }
  applyReconciliation(): Promise<never> {
    return Promise.reject(new Error("NoopTransactionRepository: applyReconciliation non utilisé"));
  }
}

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const SECRETS: Record<string, string> = {
  SUMUP_WEBHOOK_SECRET: "sumup-hmac-key",
  ZETTLE_WEBHOOK_SECRET: "zettle-hmac-key",
};

/** Signature HMAC-SHA256 attendue par le socle (hex du corps brut). */
const sign = (secret: string, rawBody: string): string =>
  createHmac("sha256", secret).update(rawBody).digest("hex");

/** Une transaction stockée = l'insert normalisé + les invariants de persistance. */
interface StoredTransaction extends ExternalTransactionInsert {
  id: string;
  status: "UNMAPPED";
}

class InMemoryWebhookRepository implements WebhookRepository {
  readonly providers: WebhookProviderRecord[] = [];
  readonly transactions: StoredTransaction[] = [];
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

  findActiveProvider(kind: ExternalProviderKind): Promise<WebhookProviderRecord | null> {
    return Promise.resolve(this.providers.find((p) => p.kind === kind && p.isActive) ?? null);
  }
  findTransaction(providerId: string, externalId: string): Promise<{ id: string } | null> {
    const row = this.transactions.find(
      (t) => t.providerId === providerId && t.externalId === externalId,
    );
    return Promise.resolve(row ? { id: row.id } : null);
  }
  insertTransaction(data: ExternalTransactionInsert): Promise<{ id: string }> {
    // Reproduit l'invariant de l'adaptateur Prisma : status UNMAPPED (kind fourni).
    const row: StoredTransaction = { ...data, id: `t${++this.seq}`, status: "UNMAPPED" };
    this.transactions.push(row);
    return Promise.resolve({ id: row.id });
  }
}

/** Vente SumUp : montants en **euros décimaux**, réf. produit = `products[0].id`. */
const sumUpPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  event_type: "transaction.updated",
  transaction: {
    id: "SUMUP-TX-001",
    amount: 4.5,
    currency: "EUR",
    timestamp: "2026-07-16T10:00:00.000Z",
    payment_type: "POS",
    products: [{ id: "SKU-BLONDE-33", name: "Blonde 33cl" }],
    ...overrides,
  },
});

/** Achat Zettle : montants en **centimes**, réf. produit = `products[0].productUuid`. */
const zettlePayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  purchase: {
    purchaseUuid: "ZETTLE-P-001",
    amount: 650,
    currency: "EUR",
    timestamp: "2026-07-16T11:00:00.000Z",
    payments: [{ type: "CARD" }],
    products: [{ productUuid: "ZP-IPA-33", name: "IPA 33cl" }],
    ...overrides,
  },
});

async function makeApp(
  repo: InMemoryWebhookRepository,
  resolver: SecretResolver = (ref) => SECRETS[ref],
  overrides: Partial<AppConfig> = {},
): Promise<FastifyInstance> {
  const app = await buildApp({
    config: { ...config, ...overrides },
    webhookRepository: repo,
    webhookSecretResolver: resolver,
    transactionRepository: new NoopTransactionRepository(),
  });
  await app.ready();
  return app;
}

function post(
  app: FastifyInstance,
  url: string,
  rawBody: string,
  headers: Record<string, string>,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method: "POST",
    url,
    headers: { "content-type": "application/json", ...headers },
    payload: rawBody,
  });
}

describe("webhooks de vente SumUp & Zettle (M7-03)", () => {
  let repo: InMemoryWebhookRepository;
  let app: FastifyInstance;

  beforeEach(async () => {
    repo = new InMemoryWebhookRepository();
    repo.seedProvider("SUMUP", "SumUp", "SUMUP_WEBHOOK_SECRET");
    repo.seedProvider("ZETTLE", "Zettle", "ZETTLE_WEBHOOK_SECRET");
    app = await makeApp(repo);
  });

  it("SumUp : vente signée → ExternalTransaction SALE/UNMAPPED (euros→centimes, produit extrait)", async () => {
    const raw = JSON.stringify(sumUpPayload());
    const res = await post(app, "/webhooks/sumup", raw, {
      "x-webhook-signature": sign(SECRETS.SUMUP_WEBHOOK_SECRET!, raw),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "created" });
    expect(repo.transactions).toHaveLength(1);
    const tx = repo.transactions[0]!;
    expect(tx).toMatchObject({
      providerId: "p-sumup",
      externalId: "SUMUP-TX-001",
      kind: "SALE" as ExternalTransactionKind,
      amountCents: 450,
      currency: "EUR",
      paymentMethod: "POS",
      externalProductId: "SKU-BLONDE-33",
      status: "UNMAPPED",
    });
    expect(tx.occurredAt).toEqual(new Date("2026-07-16T10:00:00.000Z"));
    // Payload brut intégral conservé (append-only, ADR-09).
    expect(tx.rawPayload).toEqual(sumUpPayload());
  });

  it("Zettle : vente signée → ExternalTransaction SALE/UNMAPPED (centimes, produit extrait)", async () => {
    const raw = JSON.stringify(zettlePayload());
    const res = await post(app, "/webhooks/zettle", raw, {
      "x-webhook-signature": sign(SECRETS.ZETTLE_WEBHOOK_SECRET!, raw),
    });

    expect(res.statusCode).toBe(201);
    expect(repo.transactions).toHaveLength(1);
    expect(repo.transactions[0]!).toMatchObject({
      providerId: "p-zettle",
      externalId: "ZETTLE-P-001",
      kind: "SALE" as ExternalTransactionKind,
      amountCents: 650,
      currency: "EUR",
      paymentMethod: "CARD",
      externalProductId: "ZP-IPA-33",
      status: "UNMAPPED",
    });
  });

  it("rejette une signature invalide → 401, aucune écriture", async () => {
    const raw = JSON.stringify(sumUpPayload());
    const res = await post(app, "/webhooks/sumup", raw, { "x-webhook-signature": "deadbeef" });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(repo.transactions).toHaveLength(0);
  });

  it("rejette une requête non signée (en-tête absent) → 401, aucune écriture", async () => {
    const raw = JSON.stringify(zettlePayload());
    const res = await post(app, "/webhooks/zettle", raw, {});

    expect(res.statusCode).toBe(401);
    expect(repo.transactions).toHaveLength(0);
  });

  it("est idempotent : même externalId rejoué → 200 no-op, une seule ligne", async () => {
    const raw = JSON.stringify(sumUpPayload());
    const sig = sign(SECRETS.SUMUP_WEBHOOK_SECRET!, raw);

    const first = await post(app, "/webhooks/sumup", raw, { "x-webhook-signature": sig });
    const second = await post(app, "/webhooks/sumup", raw, { "x-webhook-signature": sig });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ status: "created" });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: "duplicate" });
    expect(repo.transactions).toHaveLength(1);
  });

  it("ingère une vente sans externalProductId sans erreur (→ anomalie en M7-05)", async () => {
    const raw = JSON.stringify(sumUpPayload({ products: [] }));
    const res = await post(app, "/webhooks/sumup", raw, {
      "x-webhook-signature": sign(SECRETS.SUMUP_WEBHOOK_SECRET!, raw),
    });

    expect(res.statusCode).toBe(201);
    expect(repo.transactions).toHaveLength(1);
    expect(repo.transactions[0]!.externalProductId).toBeNull();
  });

  it("gère un fournisseur inactif sans 500 → 404", async () => {
    repo.providers.find((p) => p.kind === "SUMUP")!.isActive = false;
    const raw = JSON.stringify(sumUpPayload());
    const res = await post(app, "/webhooks/sumup", raw, {
      "x-webhook-signature": sign(SECRETS.SUMUP_WEBHOOK_SECRET!, raw),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("WEBHOOK_PROVIDER_UNAVAILABLE");
    expect(repo.transactions).toHaveLength(0);
  });

  it("secret non configuré en environnement → 401 générique, aucune écriture", async () => {
    const noSecretApp = await makeApp(repo, () => undefined);
    const raw = JSON.stringify(zettlePayload());
    const res = await post(noSecretApp, "/webhooks/zettle", raw, {
      "x-webhook-signature": sign(SECRETS.ZETTLE_WEBHOOK_SECRET!, raw),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(repo.transactions).toHaveLength(0);
  });

  it("valide la signature mais rejette un payload incomplet → 400, aucune écriture", async () => {
    // JSON signable mais sans `purchase.purchaseUuid` requis → extraction Zod échoue.
    const raw = JSON.stringify({
      purchase: { amount: 650, timestamp: "2026-07-16T11:00:00.000Z" },
    });
    const res = await post(app, "/webhooks/zettle", raw, {
      "x-webhook-signature": sign(SECRETS.ZETTLE_WEBHOOK_SECRET!, raw),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    expect(repo.transactions).toHaveLength(0);
  });

  it("applique un rate-limit (socle §6) : au-delà du quota → 429", async () => {
    const limited = await makeApp(repo, undefined, { RATE_LIMIT_MAX: 2 });
    const raw = JSON.stringify(sumUpPayload());

    const r1 = await post(limited, "/webhooks/sumup", raw, {});
    const r2 = await post(limited, "/webhooks/sumup", raw, {});
    const r3 = await post(limited, "/webhooks/sumup", raw, {});

    expect(r1.statusCode).not.toBe(429);
    expect(r2.statusCode).not.toBe(429);
    expect(r3.statusCode).toBe(429);
  });
});
