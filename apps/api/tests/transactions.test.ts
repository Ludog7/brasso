import { createHash, createHmac } from "node:crypto";

import { normalizeMatchKey } from "@brasso/core";
import type { MembershipStatus } from "@brasso/db";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AuditEntryRecord,
  AuditInsert,
  AuditListFilters,
  AuditListResult,
  AuditRepository,
} from "../src/modules/audit/repository.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import type {
  ReconcileMemberRef,
  ReconciliationEffect,
  TransactionListFilters,
  TransactionListResult,
  TransactionRecord,
  TransactionRepository,
} from "../src/modules/transactions/repository.js";
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

const DAY = 24 * 60 * 60 * 1000;
const SECRET_REF = "HELLOASSO_WEBHOOK_SECRET";
const SECRET = "topsecret-hmac-key";
const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");
const sign = (secret: string, raw: string): string =>
  createHmac("sha256", secret).update(raw).digest("hex");

// ── Repositories mémoire ────────────────────────────────────────────────────

interface StoredMember extends ReconcileMemberRef {
  email: string | null;
  membership: MembershipStatus;
}

class InMemoryTransactionRepository implements TransactionRepository {
  readonly members: StoredMember[] = [];
  constructor(
    readonly txs: TransactionRecord[] = [],
    private readonly periodDays = 365,
  ) {}

  seedMember(m: { id: string; email?: string | null; lastContributionAt?: Date | null }): void {
    this.members.push({
      id: m.id,
      email: m.email ?? null,
      lastContributionAt: m.lastContributionAt ?? null,
      membership: "EN_RETARD",
    });
  }
  seedTx(t: { id: string; occurredAt: Date } & Partial<TransactionRecord>): TransactionRecord {
    const row: TransactionRecord = {
      providerId: "p1",
      externalId: t.id,
      kind: "MEMBERSHIP",
      amountCents: 2500,
      currency: "EUR",
      paymentMethod: null,
      status: "UNMAPPED",
      memberId: null,
      createdAt: new Date(),
      ...t,
    };
    this.txs.push(row);
    return row;
  }

  findById(id: string): Promise<TransactionRecord | null> {
    return Promise.resolve(this.txs.find((t) => t.id === id) ?? null);
  }
  list(f: TransactionListFilters): Promise<TransactionListResult> {
    let rows = [...this.txs];
    if (f.status !== undefined) rows = rows.filter((t) => t.status === f.status);
    if (f.kind !== undefined) rows = rows.filter((t) => t.kind === f.kind);
    rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const total = rows.length;
    return Promise.resolve({ transactions: rows.slice(f.offset, f.offset + f.limit), total });
  }
  getMemberById(id: string): Promise<ReconcileMemberRef | null> {
    const m = this.members.find((x) => x.id === id);
    return Promise.resolve(m ? { id: m.id, lastContributionAt: m.lastContributionAt } : null);
  }
  findMembersByNormalizedEmail(key: string): Promise<ReconcileMemberRef[]> {
    return Promise.resolve(
      this.members
        .filter((m) => m.email !== null && normalizeMatchKey(m.email) === key)
        .map((m) => ({ id: m.id, lastContributionAt: m.lastContributionAt })),
    );
  }
  membershipPeriodDays(): Promise<number> {
    return Promise.resolve(this.periodDays);
  }
  applyReconciliation(effect: ReconciliationEffect): Promise<TransactionRecord> {
    const tx = this.txs.find((t) => t.id === effect.transactionId)!;
    tx.memberId = effect.memberId;
    tx.status = "MAPPED";
    const m = this.members.find((x) => x.id === effect.memberId);
    if (m) {
      m.lastContributionAt = effect.lastContributionAt;
      m.membership = effect.membership;
    }
    return Promise.resolve(tx);
  }
}

/** Webhook repo mémoire **partageant le store de transactions** (bout-en-bout auto). */
class SharedWebhookRepository implements WebhookRepository {
  private seq = 0;
  constructor(private readonly txs: TransactionRecord[]) {}
  findActiveProvider(): Promise<WebhookProviderRecord | null> {
    return Promise.resolve({
      id: "p1",
      kind: "HELLOASSO",
      label: "HelloAsso",
      webhookSecretRef: SECRET_REF,
      isActive: true,
    });
  }
  findTransaction(providerId: string, externalId: string): Promise<{ id: string } | null> {
    const t = this.txs.find((x) => x.providerId === providerId && x.externalId === externalId);
    return Promise.resolve(t ? { id: t.id } : null);
  }
  insertTransaction(data: ExternalTransactionInsert): Promise<{ id: string }> {
    const row: TransactionRecord = {
      id: `t${++this.seq}`,
      providerId: data.providerId,
      externalId: data.externalId,
      kind: "MEMBERSHIP",
      amountCents: data.amountCents,
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      status: "UNMAPPED",
      memberId: null,
      occurredAt: data.occurredAt,
      createdAt: new Date(),
    };
    this.txs.push(row);
    return Promise.resolve({ id: row.id });
  }
}

class InMemoryAuditRepository implements AuditRepository {
  readonly rows: AuditEntryRecord[] = [];
  private seq = 0;
  record(entry: AuditInsert): Promise<AuditEntryRecord> {
    const row: AuditEntryRecord = {
      id: `a${++this.seq}`,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      memberId: entry.memberId ?? null,
      ip: entry.ip ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
  list(filters: AuditListFilters): Promise<AuditListResult> {
    let rows = [...this.rows];
    if (filters.action !== undefined) rows = rows.filter((r) => r.action === filters.action);
    if (filters.memberId !== undefined) rows = rows.filter((r) => r.memberId === filters.memberId);
    return Promise.resolve({
      entries: rows.slice(filters.offset, filters.offset + filters.limit),
      total: rows.length,
    });
  }
}

class InMemoryAuthRepository implements AuthRepository {
  private byId = new Map<string, AuthUserRecord>();
  private sessions = new Map<string, SessionRecord>();
  addUser(user: AuthUserRecord): void {
    this.byId.set(user.id, user);
  }
  addSession(session: SessionRecord): void {
    this.sessions.set(session.tokenHash, session);
  }
  findUserByEmail(): Promise<AuthUserRecord | null> {
    return Promise.resolve(null);
  }
  findUserById(id: string): Promise<AuthUserRecord | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.tokenHash, session);
    return Promise.resolve();
  }
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(tokenHash) ?? null);
  }
  deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

async function makeApp(opts: {
  transactions: InMemoryTransactionRepository;
  audit: InMemoryAuditRepository;
  webhook?: WebhookRepository;
}): Promise<{ app: FastifyInstance; cookieFor: (u: string) => string }> {
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
  const app = await buildApp({
    config,
    authRepository: auth,
    transactionRepository: opts.transactions,
    auditRepository: opts.audit,
    ...(opts.webhook
      ? {
          webhookRepository: opts.webhook,
          webhookSecretResolver: (ref: string) => (ref === SECRET_REF ? SECRET : undefined),
        }
      : {}),
  });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

function req(
  app: FastifyInstance,
  method: string,
  url: string,
  cookie: string | undefined,
  payload?: unknown,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method: method as "GET",
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });
}

// ── Tests module transactions (liste + rapprochement manuel + RBAC) ─────────

describe("rapprochement cotisation→membre (M6-08)", () => {
  let txn: InMemoryTransactionRepository;
  let audit: InMemoryAuditRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;
  let recentOccurredAt: Date;

  beforeEach(async () => {
    txn = new InMemoryTransactionRepository([], 365);
    audit = new InMemoryAuditRepository();
    txn.seedMember({ id: "m-ada", email: "ada@example.org" });
    txn.seedMember({ id: "m-grace", email: "grace@example.org" });
    // Cotisation récente non rapprochée (date figée pour comparaison déterministe).
    recentOccurredAt = new Date(Date.now() - 10 * DAY);
    txn.seedTx({ id: "t-recent", occurredAt: recentOccurredAt });
    ({ app, cookieFor } = await makeApp({ transactions: txn, audit }));
  });

  it("rapproche manuellement → MAPPED + lastContributionAt + membre A_JOUR + audit", async () => {
    const res = await req(app, "POST", "/api/transactions/t-recent/reconcile", cookieFor("admin"), {
      memberId: "m-ada",
    });
    expect(res.statusCode).toBe(200);
    const tx = (res.json() as { transaction: { status: string; memberId: string } }).transaction;
    expect(tx.status).toBe("MAPPED");
    expect(tx.memberId).toBe("m-ada");

    const member = txn.members.find((m) => m.id === "m-ada")!;
    expect(member.membership).toBe("A_JOUR");
    expect(member.lastContributionAt).toEqual(recentOccurredAt);
    expect(
      audit.rows.some(
        (e) =>
          e.action === "CONTRIBUTION_RECONCILE" &&
          e.memberId === "m-ada" &&
          (e.metadata as { auto?: boolean }).auto === false,
      ),
    ).toBe(true);
  });

  it("404 si transaction ou membre absent", async () => {
    const noTx = await req(app, "POST", "/api/transactions/nope/reconcile", cookieFor("admin"), {
      memberId: "m-ada",
    });
    expect(noTx.statusCode).toBe(404);
    expect(noTx.json().error.code).toBe("TRANSACTION_NOT_FOUND");

    const noMember = await req(
      app,
      "POST",
      "/api/transactions/t-recent/reconcile",
      cookieFor("admin"),
      { memberId: "ghost" },
    );
    expect(noMember.statusCode).toBe(404);
    expect(noMember.json().error.code).toBe("MEMBER_NOT_FOUND");
  });

  it("409 si déjà rapprochée à un autre membre ; idempotent au même membre", async () => {
    await req(app, "POST", "/api/transactions/t-recent/reconcile", cookieFor("admin"), {
      memberId: "m-ada",
    });
    const clash = await req(
      app,
      "POST",
      "/api/transactions/t-recent/reconcile",
      cookieFor("admin"),
      { memberId: "m-grace" },
    );
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe("TRANSACTION_ALREADY_RECONCILED");

    const auditCount = audit.rows.filter((e) => e.action === "CONTRIBUTION_RECONCILE").length;
    const again = await req(
      app,
      "POST",
      "/api/transactions/t-recent/reconcile",
      cookieFor("admin"),
      { memberId: "m-ada" },
    );
    expect(again.statusCode).toBe(200); // no-op
    expect((again.json() as { transaction: { status: string } }).transaction.status).toBe("MAPPED");
    // Pas de nouvel audit sur un no-op.
    expect(audit.rows.filter((e) => e.action === "CONTRIBUTION_RECONCILE").length).toBe(auditCount);
  });

  it("lastContributionAt ne régresse jamais (garde max)", async () => {
    const recent = new Date(Date.now() - 5 * DAY);
    txn.seedMember({ id: "m-max", email: "max@example.org", lastContributionAt: recent });
    txn.seedTx({ id: "t-old", occurredAt: new Date(Date.now() - 300 * DAY) });

    const res = await req(app, "POST", "/api/transactions/t-old/reconcile", cookieFor("admin"), {
      memberId: "m-max",
    });
    expect(res.statusCode).toBe(200);
    const member = txn.members.find((m) => m.id === "m-max")!;
    expect(member.lastContributionAt).toEqual(recent); // conserve la date plus récente
    expect(member.membership).toBe("A_JOUR");
  });

  it("liste les cotisations à rapprocher (GET ?status=UNMAPPED&kind=MEMBERSHIP)", async () => {
    txn.seedTx({ id: "t-older", occurredAt: new Date(Date.now() - 40 * DAY) });
    const res = await req(
      app,
      "GET",
      "/api/transactions?status=UNMAPPED&kind=MEMBERSHIP",
      cookieFor("caisse"),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { transactions: { id: string }[]; total: number };
    expect(body.total).toBe(2);
    // occurredAt desc : la plus récente d'abord.
    expect(body.transactions[0]?.id).toBe("t-recent");
    expect(body.transactions.some((t) => Object.keys(t).includes("rawPayload"))).toBe(false);
  });

  it("RBAC : lecture transactions (admin/brasseur/caisse oui, rgpd non)", async () => {
    for (const role of ["admin", "brasseur", "caisse"]) {
      expect((await req(app, "GET", "/api/transactions", cookieFor(role))).statusCode).toBe(200);
    }
    expect((await req(app, "GET", "/api/transactions", cookieFor("rgpd"))).statusCode).toBe(403);
  });

  it("RBAC : rapprochement réservé à membres:update (brasseur/caisse → 403, rgpd → 200)", async () => {
    for (const role of ["brasseur", "caisse"]) {
      const res = await req(app, "POST", "/api/transactions/t-recent/reconcile", cookieFor(role), {
        memberId: "m-ada",
      });
      expect(res.statusCode).toBe(403);
    }
    const ok = await req(app, "POST", "/api/transactions/t-recent/reconcile", cookieFor("rgpd"), {
      memberId: "m-ada",
    });
    expect(ok.statusCode).toBe(200);
  });
});

// ── Test bout-en-bout : auto-rapprochement déclenché par le webhook (DÉMO M6) ─

describe("auto-rapprochement à l'ingestion webhook (M6-08, démo M6)", () => {
  const payload = (email: string): string =>
    JSON.stringify({
      eventType: "Order",
      data: {
        id: `evt-${email}`,
        amount: { total: 2500, currency: "EUR" },
        date: new Date(Date.now() - 3 * DAY).toISOString(),
        paymentMeans: "Card",
        payer: { email },
      },
    });

  it("email correspondant à un membre unique → cotisation MAPPED + membre A_JOUR + audit", async () => {
    const txn = new InMemoryTransactionRepository([], 365);
    const audit = new InMemoryAuditRepository();
    txn.seedMember({ id: "m-ada", email: "Ada@Example.org" }); // casse différente : normalisée
    const webhook = new SharedWebhookRepository(txn.txs);
    const { app } = await makeApp({ transactions: txn, audit, webhook });

    const raw = payload("ada@example.org");
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/helloasso",
      headers: { "content-type": "application/json", "x-webhook-signature": sign(SECRET, raw) },
      payload: raw,
    });

    expect(res.statusCode).toBe(201);
    expect(txn.txs).toHaveLength(1);
    expect(txn.txs[0]!.status).toBe("MAPPED");
    expect(txn.txs[0]!.memberId).toBe("m-ada");
    expect(txn.members.find((m) => m.id === "m-ada")!.membership).toBe("A_JOUR");
    expect(
      audit.rows.some((e) => e.action === "CONTRIBUTION_RECONCILE" && e.memberId === "m-ada"),
    ).toBe(true);
  });

  it("email inconnu → cotisation ingérée mais UNMAPPED (ingestion non cassée)", async () => {
    const txn = new InMemoryTransactionRepository([], 365);
    const audit = new InMemoryAuditRepository();
    txn.seedMember({ id: "m-ada", email: "ada@example.org" });
    const webhook = new SharedWebhookRepository(txn.txs);
    const { app } = await makeApp({ transactions: txn, audit, webhook });

    const raw = payload("inconnu@example.org");
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/helloasso",
      headers: { "content-type": "application/json", "x-webhook-signature": sign(SECRET, raw) },
      payload: raw,
    });

    expect(res.statusCode).toBe(201);
    expect(txn.txs[0]!.status).toBe("UNMAPPED");
    expect(txn.txs[0]!.memberId).toBeNull();
    expect(audit.rows.some((e) => e.action === "CONTRIBUTION_RECONCILE")).toBe(false);
  });

  it("email ambigu (plusieurs membres) → UNMAPPED (à rapprocher manuellement)", async () => {
    const txn = new InMemoryTransactionRepository([], 365);
    const audit = new InMemoryAuditRepository();
    txn.seedMember({ id: "m-1", email: "dup@example.org" });
    txn.seedMember({ id: "m-2", email: "DUP@example.org" }); // même clé normalisée
    const webhook = new SharedWebhookRepository(txn.txs);
    const { app } = await makeApp({ transactions: txn, audit, webhook });

    const raw = payload("dup@example.org");
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/helloasso",
      headers: { "content-type": "application/json", "x-webhook-signature": sign(SECRET, raw) },
      payload: raw,
    });

    expect(res.statusCode).toBe(201);
    expect(txn.txs[0]!.status).toBe("UNMAPPED");
  });
});
