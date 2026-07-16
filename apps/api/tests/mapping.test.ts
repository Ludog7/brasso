import { createHash } from "node:crypto";

import type { CatalogKind } from "@brasso/db";
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
  MappingListFilters,
  MappingRecord,
  MappingRepository,
  MappingWriteData,
} from "../src/modules/mapping/repository.js";
import type {
  ReconcileMemberRef,
  ReconciliationEffect,
  TransactionListFilters,
  TransactionListResult,
  TransactionRecord,
  TransactionRepository,
} from "../src/modules/transactions/repository.js";
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

// ── Repositories mémoire ────────────────────────────────────────────────────

class InMemoryMappingRepository implements MappingRepository {
  readonly mappings: MappingRecord[] = [];
  readonly catalogItems = new Map<string, { id: string; name: string; kind: CatalogKind }>();
  private seq = 0;

  seedCatalogItem(id: string, name = "Blonde 33cl", kind: CatalogKind = "CONDITIONNEMENT"): void {
    this.catalogItems.set(id, { id, name, kind });
  }

  private join(catalogItemId: string | null): MappingRecord["catalogItem"] {
    return catalogItemId !== null ? (this.catalogItems.get(catalogItemId) ?? null) : null;
  }

  list(filters: MappingListFilters): Promise<{ mappings: MappingRecord[]; total: number }> {
    let rows = [...this.mappings];
    if (filters.providerId !== undefined) {
      rows = rows.filter((m) => m.providerId === filters.providerId);
    }
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = rows.length;
    return Promise.resolve({
      mappings: rows.slice(filters.offset, filters.offset + filters.limit),
      total,
    });
  }
  findById(id: string): Promise<MappingRecord | null> {
    return Promise.resolve(this.mappings.find((m) => m.id === id) ?? null);
  }
  findByProviderProduct(
    providerId: string,
    externalProductId: string,
  ): Promise<{ id: string } | null> {
    const m = this.mappings.find(
      (x) => x.providerId === providerId && x.externalProductId === externalProductId,
    );
    return Promise.resolve(m ? { id: m.id } : null);
  }
  findByInternalSku(internalSku: string): Promise<{ id: string } | null> {
    const m = this.mappings.find((x) => x.internalSku === internalSku);
    return Promise.resolve(m ? { id: m.id } : null);
  }
  catalogItemExists(id: string): Promise<boolean> {
    return Promise.resolve(this.catalogItems.has(id));
  }
  create(data: MappingWriteData): Promise<MappingRecord> {
    const now = new Date();
    const row: MappingRecord = {
      id: `map${++this.seq}`,
      internalSku: data.internalSku,
      catalogItemId: data.catalogItemId,
      catalogItem: this.join(data.catalogItemId),
      providerId: data.providerId,
      externalProductId: data.externalProductId,
      externalCategory: data.externalCategory,
      createdAt: now,
      updatedAt: now,
    };
    this.mappings.push(row);
    return Promise.resolve(row);
  }
  update(id: string, data: Partial<MappingWriteData>): Promise<MappingRecord> {
    const row = this.mappings.find((m) => m.id === id)!;
    Object.assign(row, data);
    if ("catalogItemId" in data) {
      row.catalogItem = this.join(row.catalogItemId);
    }
    row.updatedAt = new Date();
    return Promise.resolve(row);
  }
  delete(id: string): Promise<void> {
    const i = this.mappings.findIndex((m) => m.id === id);
    if (i >= 0) this.mappings.splice(i, 1);
    return Promise.resolve();
  }
}

/** Repo transactions mémoire (lecture SALE + filtres) — écritures non utilisées ici. */
class InMemoryTransactionRepository implements TransactionRepository {
  constructor(readonly txs: TransactionRecord[] = []) {}

  seedTx(t: { id: string; occurredAt: Date } & Partial<TransactionRecord>): void {
    this.txs.push({
      providerId: "p-sumup",
      externalId: t.id,
      kind: "SALE",
      amountCents: 450,
      currency: "EUR",
      paymentMethod: "POS",
      externalProductId: "SKU-BLONDE-33",
      status: "UNMAPPED",
      memberId: null,
      createdAt: new Date(),
      ...t,
    });
  }

  findById(id: string): Promise<TransactionRecord | null> {
    return Promise.resolve(this.txs.find((t) => t.id === id) ?? null);
  }
  list(f: TransactionListFilters): Promise<TransactionListResult> {
    let rows = [...this.txs];
    if (f.status !== undefined) rows = rows.filter((t) => t.status === f.status);
    if (f.kind !== undefined) rows = rows.filter((t) => t.kind === f.kind);
    if (f.providerId !== undefined) rows = rows.filter((t) => t.providerId === f.providerId);
    rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return Promise.resolve({
      transactions: rows.slice(f.offset, f.offset + f.limit),
      total: rows.length,
    });
  }
  getMemberById(): Promise<ReconcileMemberRef | null> {
    return Promise.resolve(null);
  }
  findMembersByNormalizedEmail(): Promise<ReconcileMemberRef[]> {
    return Promise.resolve([]);
  }
  membershipPeriodDays(): Promise<number> {
    return Promise.resolve(365);
  }
  applyReconciliation(effect: ReconciliationEffect): Promise<TransactionRecord> {
    return Promise.reject(new Error(`applyReconciliation non utilisé (${effect.transactionId})`));
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
  mapping: InMemoryMappingRepository;
  transactions: InMemoryTransactionRepository;
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
    mappingRepository: opts.mapping,
    transactionRepository: opts.transactions,
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

const CATALOG_ID = "cat-blonde";
const newMapping = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  internalSku: "SKU-BLD-33",
  catalogItemId: CATALOG_ID,
  providerId: "p-sumup",
  externalProductId: "SUMUP-PROD-BLONDE",
  externalCategory: "Bières",
  ...over,
});

// ── CRUD mapping SKU ────────────────────────────────────────────────────────

describe("CRUD mapping SKU (M7-04)", () => {
  let mapping: InMemoryMappingRepository;
  let transactions: InMemoryTransactionRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    mapping = new InMemoryMappingRepository();
    mapping.seedCatalogItem(CATALOG_ID);
    transactions = new InMemoryTransactionRepository();
    ({ app, cookieFor } = await makeApp({ mapping, transactions }));
  });

  it("caisse crée un mapping externalProductId→catalogItem → 201 + article joint", async () => {
    const res = await req(app, "POST", "/api/mappings", cookieFor("caisse"), newMapping());
    expect(res.statusCode).toBe(201);
    const m = (res.json() as { mapping: MappingRecord }).mapping;
    expect(m).toMatchObject({
      internalSku: "SKU-BLD-33",
      catalogItemId: CATALOG_ID,
      providerId: "p-sumup",
      externalProductId: "SUMUP-PROD-BLONDE",
      externalCategory: "Bières",
    });
    expect(m.catalogItem).toMatchObject({
      id: CATALOG_ID,
      name: "Blonde 33cl",
      kind: "CONDITIONNEMENT",
    });
    expect(mapping.mappings).toHaveLength(1);
  });

  it("crée un mapping sans catalogItem (incomplet, autorisé) → 201, catalogItem null", async () => {
    const res = await req(
      app,
      "POST",
      "/api/mappings",
      cookieFor("caisse"),
      newMapping({ catalogItemId: undefined }),
    );
    expect(res.statusCode).toBe(201);
    expect((res.json() as { mapping: MappingRecord }).mapping.catalogItem).toBeNull();
  });

  it("409 MAPPING_CONFLICT sur doublon (providerId, externalProductId)", async () => {
    await req(app, "POST", "/api/mappings", cookieFor("caisse"), newMapping());
    const dup = await req(
      app,
      "POST",
      "/api/mappings",
      cookieFor("caisse"),
      newMapping({ internalSku: "SKU-AUTRE" }), // SKU différent, même produit externe
    );
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("MAPPING_CONFLICT");
    expect(mapping.mappings).toHaveLength(1);
  });

  it("409 MAPPING_CONFLICT sur doublon internalSku", async () => {
    await req(app, "POST", "/api/mappings", cookieFor("caisse"), newMapping());
    const dup = await req(
      app,
      "POST",
      "/api/mappings",
      cookieFor("caisse"),
      newMapping({ externalProductId: "SUMUP-PROD-AUTRE" }), // produit différent, même SKU
    );
    expect(dup.statusCode).toBe(409);
    expect(mapping.mappings).toHaveLength(1);
  });

  it("catalogItemId inexistant → 404 CATALOG_ITEM_NOT_FOUND, rien créé", async () => {
    const res = await req(
      app,
      "POST",
      "/api/mappings",
      cookieFor("caisse"),
      newMapping({ catalogItemId: "ghost" }),
    );
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("CATALOG_ITEM_NOT_FOUND");
    expect(mapping.mappings).toHaveLength(0);
  });

  it("PATCH rattache un article puis liste filtrée par providerId", async () => {
    const created = await req(
      app,
      "POST",
      "/api/mappings",
      cookieFor("caisse"),
      newMapping({ catalogItemId: undefined }),
    );
    const id = (created.json() as { mapping: MappingRecord }).mapping.id;

    const patched = await req(app, "PATCH", `/api/mappings/${id}`, cookieFor("caisse"), {
      catalogItemId: CATALOG_ID,
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { mapping: MappingRecord }).mapping.catalogItem?.id).toBe(CATALOG_ID);

    const list = await req(app, "GET", "/api/mappings?providerId=p-sumup", cookieFor("caisse"));
    expect(list.statusCode).toBe(200);
    expect((list.json() as { total: number }).total).toBe(1);
  });

  it("PATCH catalogItemId:null détache l'article", async () => {
    const created = await req(app, "POST", "/api/mappings", cookieFor("caisse"), newMapping());
    const id = (created.json() as { mapping: MappingRecord }).mapping.id;

    const patched = await req(app, "PATCH", `/api/mappings/${id}`, cookieFor("caisse"), {
      catalogItemId: null,
    });
    expect(patched.statusCode).toBe(200);
    const m = (patched.json() as { mapping: MappingRecord }).mapping;
    expect(m.catalogItemId).toBeNull();
    expect(m.catalogItem).toBeNull();
  });

  it("PATCH/DELETE sur mapping absent → 404 MAPPING_NOT_FOUND", async () => {
    const patch = await req(app, "PATCH", "/api/mappings/nope", cookieFor("caisse"), {
      externalCategory: "X",
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json().error.code).toBe("MAPPING_NOT_FOUND");

    const del = await req(app, "DELETE", "/api/mappings/nope", cookieFor("caisse"));
    expect(del.statusCode).toBe(404);
  });

  it("DELETE supprime un mapping existant → 204", async () => {
    const created = await req(app, "POST", "/api/mappings", cookieFor("caisse"), newMapping());
    const id = (created.json() as { mapping: MappingRecord }).mapping.id;
    const del = await req(app, "DELETE", `/api/mappings/${id}`, cookieFor("caisse"));
    expect(del.statusCode).toBe(204);
    expect(mapping.mappings).toHaveLength(0);
  });

  it("RBAC mapping : caisse/admin CRUD ; brasseur R seul ; rgpd aucun", async () => {
    // Lecture : admin/brasseur/caisse oui, rgpd non.
    for (const role of ["admin", "brasseur", "caisse"]) {
      expect((await req(app, "GET", "/api/mappings", cookieFor(role))).statusCode).toBe(200);
    }
    expect((await req(app, "GET", "/api/mappings", cookieFor("rgpd"))).statusCode).toBe(403);

    // Création : caisse/admin oui ; brasseur/rgpd non.
    expect(
      (await req(app, "POST", "/api/mappings", cookieFor("admin"), newMapping())).statusCode,
    ).toBe(201);
    expect(
      (
        await req(
          app,
          "POST",
          "/api/mappings",
          cookieFor("brasseur"),
          newMapping({ internalSku: "SKU-B", externalProductId: "P-B" }),
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await req(
          app,
          "POST",
          "/api/mappings",
          cookieFor("rgpd"),
          newMapping({ internalSku: "SKU-R", externalProductId: "P-R" }),
        )
      ).statusCode,
    ).toBe(403);
  });

  it("refuse un utilisateur non authentifié → 401", async () => {
    expect((await req(app, "GET", "/api/mappings", undefined)).statusCode).toBe(401);
  });
});

// ── Lecture des transactions externes (read-only, ADR-09) ────────────────────

describe("lecture des transactions externes (M7-04)", () => {
  let mapping: InMemoryMappingRepository;
  let transactions: InMemoryTransactionRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    mapping = new InMemoryMappingRepository();
    transactions = new InMemoryTransactionRepository();
    transactions.seedTx({ id: "sale-1", occurredAt: new Date("2026-07-16T10:00:00Z") });
    transactions.seedTx({
      id: "sale-2",
      occurredAt: new Date("2026-07-16T11:00:00Z"),
      providerId: "p-zettle",
      externalProductId: "ZP-IPA-33",
    });
    transactions.seedTx({
      id: "memb-1",
      kind: "MEMBERSHIP",
      externalProductId: null,
      occurredAt: new Date("2026-07-15T09:00:00Z"),
      providerId: "p-helloasso",
    });
    ({ app, cookieFor } = await makeApp({ mapping, transactions }));
  });

  it("liste filtrée par kind=SALE : jamais de rawPayload, externalProductId exposé, occurredAt desc", async () => {
    const res = await req(app, "GET", "/api/transactions?kind=SALE", cookieFor("caisse"));
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      transactions: { id: string; externalProductId: string | null; hasRawPayload: boolean }[];
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.transactions[0]?.id).toBe("sale-2"); // plus récente d'abord
    expect(body.transactions[0]?.externalProductId).toBe("ZP-IPA-33");
    expect(body.transactions.every((t) => t.hasRawPayload === true)).toBe(true);
    expect(body.transactions.some((t) => Object.keys(t).includes("rawPayload"))).toBe(false);
  });

  it("liste filtrée par providerId", async () => {
    const res = await req(app, "GET", "/api/transactions?providerId=p-zettle", cookieFor("caisse"));
    const body = res.json() as { transactions: { id: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.transactions[0]?.id).toBe("sale-2");
  });

  it("GET /transactions/:id → détail normalisé sans rawPayload ; 404 si absent", async () => {
    const ok = await req(app, "GET", "/api/transactions/sale-1", cookieFor("caisse"));
    expect(ok.statusCode).toBe(200);
    const tx = (ok.json() as { transaction: Record<string, unknown> }).transaction;
    expect(tx.id).toBe("sale-1");
    expect(tx.externalProductId).toBe("SKU-BLONDE-33");
    expect(tx.hasRawPayload).toBe(true);
    expect(Object.keys(tx).includes("rawPayload")).toBe(false);

    const missing = await req(app, "GET", "/api/transactions/ghost", cookieFor("caisse"));
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("TRANSACTION_NOT_FOUND");
  });

  it("aucune route d'écriture sur les transactions (ADR-09) : PATCH/PUT/DELETE → 404 route", async () => {
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const res = await req(app, method, "/api/transactions/sale-1", cookieFor("admin"), {});
      expect(res.statusCode).toBe(404); // route inexistante (not-found handler)
    }
  });

  it("RBAC transactions : admin/brasseur/caisse R ; rgpd non", async () => {
    for (const role of ["admin", "brasseur", "caisse"]) {
      expect((await req(app, "GET", "/api/transactions", cookieFor(role))).statusCode).toBe(200);
    }
    expect((await req(app, "GET", "/api/transactions", cookieFor("rgpd"))).statusCode).toBe(403);
  });
});
