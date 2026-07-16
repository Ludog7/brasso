import { createHmac } from "node:crypto";

import type { ExternalProviderKind } from "@brasso/db";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  ExternalTransactionInsert,
  WebhookProviderRecord,
  WebhookRepository,
} from "../src/modules/webhooks/repository.js";
import type { SecretResolver } from "../src/modules/webhooks/service.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const SECRET_REF = "HELLOASSO_WEBHOOK_SECRET";
const SECRET = "topsecret-hmac-key";

/** Signature HMAC-SHA256 attendue par le socle (hex du corps brut). */
const sign = (secret: string, rawBody: string): string =>
  createHmac("sha256", secret).update(rawBody).digest("hex");

/** Une transaction stockée = l'insert normalisé + les invariants de persistance. */
interface StoredTransaction extends ExternalTransactionInsert {
  id: string;
  kind: "MEMBERSHIP";
  status: "UNMAPPED";
}

class InMemoryWebhookRepository implements WebhookRepository {
  readonly providers: WebhookProviderRecord[] = [];
  readonly transactions: StoredTransaction[] = [];
  private seq = 0;

  seedProvider(partial: Partial<WebhookProviderRecord> = {}): WebhookProviderRecord {
    const provider: WebhookProviderRecord = {
      id: partial.id ?? `p${this.providers.length + 1}`,
      kind: partial.kind ?? ("HELLOASSO" as ExternalProviderKind),
      label: partial.label ?? "HelloAsso",
      webhookSecretRef: partial.webhookSecretRef ?? SECRET_REF,
      isActive: partial.isActive ?? true,
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
    // Reproduit les invariants de l'adaptateur Prisma : MEMBERSHIP, UNMAPPED.
    const row: StoredTransaction = {
      ...data,
      id: `t${++this.seq}`,
      kind: "MEMBERSHIP",
      status: "UNMAPPED",
    };
    this.transactions.push(row);
    return Promise.resolve({ id: row.id });
  }
}

const membershipPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  eventType: "Order",
  data: {
    id: 424242,
    amount: { total: 2500, currency: "EUR" },
    date: "2026-07-16T09:30:00.000Z",
    paymentMeans: "Card",
    payer: { email: "ada@example.org", firstName: "Ada", lastName: "Lovelace" },
    ...overrides,
  },
});

async function makeApp(
  repo: InMemoryWebhookRepository,
  resolver: SecretResolver = (ref) => (ref === SECRET_REF ? SECRET : undefined),
  overrides: Partial<AppConfig> = {},
): Promise<FastifyInstance> {
  const app = await buildApp({
    config: { ...config, ...overrides },
    webhookRepository: repo,
    webhookSecretResolver: resolver,
  });
  await app.ready();
  return app;
}

function post(
  app: FastifyInstance,
  rawBody: string,
  headers: Record<string, string>,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method: "POST",
    url: "/webhooks/helloasso",
    headers: { "content-type": "application/json", ...headers },
    payload: rawBody,
  });
}

describe("webhook HelloAsso (M6-07)", () => {
  let repo: InMemoryWebhookRepository;
  let app: FastifyInstance;

  beforeEach(async () => {
    repo = new InMemoryWebhookRepository();
    repo.seedProvider();
    app = await makeApp(repo);
  });

  it("ingère une cotisation signée → 201 + ExternalTransaction MEMBERSHIP normalisée", async () => {
    const raw = JSON.stringify(membershipPayload());
    const res = await post(app, raw, { "x-webhook-signature": sign(SECRET, raw) });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "created" });
    expect(repo.transactions).toHaveLength(1);
    const tx = repo.transactions[0]!;
    expect(tx).toMatchObject({
      providerId: repo.providers[0]!.id,
      externalId: "424242",
      amountCents: 2500,
      currency: "EUR",
      paymentMethod: "Card",
      kind: "MEMBERSHIP",
      status: "UNMAPPED",
    });
    expect(tx.occurredAt).toEqual(new Date("2026-07-16T09:30:00.000Z"));
    // Payload brut intégral conservé (email du payeur exploité par le rapprochement M6-08).
    expect(tx.rawPayload).toEqual(membershipPayload());
  });

  it("rejette une signature invalide → 401, aucune écriture", async () => {
    const raw = JSON.stringify(membershipPayload());
    const res = await post(app, raw, { "x-webhook-signature": "deadbeef" });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(repo.transactions).toHaveLength(0);
  });

  it("rejette une requête non signée (en-tête absent) → 401, aucune écriture", async () => {
    const raw = JSON.stringify(membershipPayload());
    const res = await post(app, raw, {});

    expect(res.statusCode).toBe(401);
    expect(repo.transactions).toHaveLength(0);
  });

  it("est idempotent : même externalId rejoué → 200 no-op, une seule ligne", async () => {
    const raw = JSON.stringify(membershipPayload());
    const sig = sign(SECRET, raw);

    const first = await post(app, raw, { "x-webhook-signature": sig });
    const second = await post(app, raw, { "x-webhook-signature": sig });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ status: "created" });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ status: "duplicate" });
    expect(repo.transactions).toHaveLength(1);
  });

  it("gère un fournisseur inactif sans 500 → 404", async () => {
    repo.providers[0]!.isActive = false;
    const raw = JSON.stringify(membershipPayload());
    const res = await post(app, raw, { "x-webhook-signature": sign(SECRET, raw) });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("WEBHOOK_PROVIDER_UNAVAILABLE");
    expect(repo.transactions).toHaveLength(0);
  });

  it("secret non configuré en environnement → 401 générique, aucune écriture", async () => {
    const noSecretApp = await makeApp(repo, () => undefined);
    const raw = JSON.stringify(membershipPayload());
    const res = await post(noSecretApp, raw, { "x-webhook-signature": sign(SECRET, raw) });

    expect(res.statusCode).toBe(401);
    // Réponse identique à une signature invalide : aucune fuite du motif serveur.
    expect(res.json().error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(repo.transactions).toHaveLength(0);
  });

  it("valide la signature mais rejette un payload incomplet → 400, aucune écriture", async () => {
    // JSON valide (signable) mais sans `data.id` requis → extraction Zod échoue.
    const raw = JSON.stringify({
      eventType: "Order",
      data: { amount: { total: 2500 }, date: "2026-07-16T09:30:00.000Z" },
    });
    const res = await post(app, raw, { "x-webhook-signature": sign(SECRET, raw) });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
    expect(repo.transactions).toHaveLength(0);
  });

  it("applique un rate-limit (socle §6) : au-delà du quota → 429", async () => {
    const limited = await makeApp(repo, undefined, { RATE_LIMIT_MAX: 2 });
    const raw = JSON.stringify(membershipPayload());
    const noSig = {}; // non signé : chaque requête consomme quand même un jeton (hook onRequest)

    const r1 = await post(limited, raw, noSig);
    const r2 = await post(limited, raw, noSig);
    const r3 = await post(limited, raw, noSig);

    expect(r1.statusCode).not.toBe(429);
    expect(r2.statusCode).not.toBe(429);
    expect(r3.statusCode).toBe(429);
  });
});
