import { createHash } from "node:crypto";

import { deriveStockLevel } from "@brasso/core";
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
  CatalogItemRecord,
  InventoryCountLine,
  InventoryLineResult,
  MovementCreatedResult,
  MovementListResult,
  PaginationInput,
  StockItemAggregate,
  StockItemDetail,
  StockItemListFilters,
  StockItemListResult,
  StockLotView,
  StockMovementInsert,
  StockMovementView,
  StockRepository,
} from "../src/modules/stock/repository.js";
import type {
  CatalogItemInput,
  CatalogItemUpdate,
  StockLotInput,
} from "../src/modules/stock/schema.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

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

/** Repository de stock en mémoire — niveau dérivé via `deriveStockLevel` (M5-01). */
class InMemoryStockRepository implements StockRepository {
  private items = new Map<string, CatalogItemRecord>();
  private movements: (StockMovementView & { catalogItemId: string })[] = [];
  private reservations: { catalogItemId: string; quantity: number; status: string }[] = [];
  private lots: StockLotView[] = [];
  private seq = 0;

  // ── Helpers de seed (tests only) ────────────────────────────────────────
  seedMovement(catalogItemId: string, delta: number): void {
    this.movements.push({
      id: `mv_${++this.seq}`,
      catalogItemId,
      delta,
      reason: "PURCHASE",
      stockLotId: null,
      batchId: null,
      note: null,
      createdAt: new Date(Date.now() + this.seq),
    });
  }
  seedReservation(catalogItemId: string, quantity: number, status = "RESERVED"): void {
    this.reservations.push({ catalogItemId, quantity, status });
  }

  private aggregate(id: string): { level: number; reservedOutstanding: number } {
    const movements = this.movements.filter((m) => m.catalogItemId === id);
    const reservedOutstanding = this.reservations
      .filter((r) => r.catalogItemId === id && r.status === "RESERVED")
      .reduce((sum, r) => sum + r.quantity, 0);
    return { level: deriveStockLevel(movements), reservedOutstanding };
  }

  listItems(filters: StockItemListFilters): Promise<StockItemListResult> {
    let rows = [...this.items.values()];
    if (filters.kind) rows = rows.filter((i) => i.kind === filters.kind);
    if (filters.category) rows = rows.filter((i) => i.category === filters.category);
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(needle));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const total = rows.length;
    const page = rows.slice(filters.offset, filters.offset + filters.limit);
    return Promise.resolve({
      items: page.map((item) => ({ ...item, ...this.aggregate(item.id) })),
      total,
    });
  }

  listAlertCandidates(): Promise<StockItemAggregate[]> {
    const rows = [...this.items.values()]
      .filter((i) => i.isActive && i.reorderThreshold !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(rows.map((item) => ({ ...item, ...this.aggregate(item.id) })));
  }

  findItemDetail(id: string): Promise<StockItemDetail | null> {
    const item = this.items.get(id);
    if (!item) return Promise.resolve(null);
    const recentMovements = this.movements
      .filter((m) => m.catalogItemId === id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map(({ catalogItemId: _c, ...view }) => view);
    return Promise.resolve({
      item: { ...item, ...this.aggregate(id) },
      lots: this.lots.filter((l) => l.catalogItemId === id),
      recentMovements,
    });
  }

  findItemById(id: string): Promise<CatalogItemRecord | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  createItem(data: CatalogItemInput): Promise<CatalogItemRecord> {
    const now = new Date();
    const record: CatalogItemRecord = {
      id: `ci_${++this.seq}`,
      name: data.name,
      kind: data.kind,
      category: data.category ?? null,
      unit: data.unit,
      attributes: data.attributes ?? null,
      defaultUnitCostCents: data.defaultUnitCostCents ?? null,
      reorderThreshold: data.reorderThreshold ?? null,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(record.id, record);
    return Promise.resolve(record);
  }

  updateItem(id: string, data: CatalogItemUpdate): Promise<CatalogItemRecord> {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`article ${id} absent (le service garantit son existence)`);
    const updated: CatalogItemRecord = {
      ...existing,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
      ...(data.defaultUnitCostCents !== undefined
        ? { defaultUnitCostCents: data.defaultUnitCostCents }
        : {}),
      ...(data.reorderThreshold !== undefined ? { reorderThreshold: data.reorderThreshold } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return Promise.resolve(updated);
  }

  createLot(catalogItemId: string, data: StockLotInput): Promise<StockLotView> {
    const lot: StockLotView = {
      id: `lot_${++this.seq}`,
      catalogItemId,
      lotCode: data.lotCode ?? null,
      quantity: data.quantity,
      bestBeforeAt: data.bestBeforeAt ?? null,
      unitCostCents: data.unitCostCents ?? null,
      createdAt: new Date(),
    };
    this.lots.push(lot);
    return Promise.resolve(lot);
  }

  private levelOf(catalogItemId: string): number {
    return deriveStockLevel(this.movements.filter((m) => m.catalogItemId === catalogItemId));
  }

  createMovement(input: StockMovementInsert): Promise<MovementCreatedResult> {
    const movement = {
      id: `mv_${++this.seq}`,
      catalogItemId: input.catalogItemId,
      delta: input.delta,
      reason: input.reason,
      stockLotId: input.stockLotId ?? null,
      batchId: null,
      note: input.note ?? null,
      createdAt: new Date(Date.now() + this.seq),
    };
    this.movements.push(movement);
    const { catalogItemId: _c, ...view } = movement;
    return Promise.resolve({ movement: view, level: this.levelOf(input.catalogItemId) });
  }

  listMovements(
    catalogItemId: string,
    { limit, offset }: PaginationInput,
  ): Promise<MovementListResult> {
    const all = this.movements
      .filter((m) => m.catalogItemId === catalogItemId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const movements = all
      .slice(offset, offset + limit)
      .map(({ catalogItemId: _c, ...view }) => view);
    return Promise.resolve({ movements, total: all.length });
  }

  applyInventory(
    lines: InventoryCountLine[],
    userId: string | null,
  ): Promise<InventoryLineResult[]> {
    void userId;
    const results: InventoryLineResult[] = [];
    for (const line of lines) {
      const previousLevel = this.levelOf(line.catalogItemId);
      const delta = line.countedQuantity - previousLevel;
      let movementId: string | undefined;
      if (delta !== 0) {
        movementId = `mv_${++this.seq}`;
        this.movements.push({
          id: movementId,
          catalogItemId: line.catalogItemId,
          delta,
          reason: "INVENTORY",
          stockLotId: null,
          batchId: null,
          note: line.note ?? null,
          createdAt: new Date(Date.now() + this.seq),
        });
      }
      results.push({
        catalogItemId: line.catalogItemId,
        previousLevel,
        countedQuantity: line.countedQuantity,
        delta,
        ...(movementId ? { movementId } : {}),
      });
    }
    return Promise.resolve(results);
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
};

async function makeApp(): Promise<{
  app: FastifyInstance;
  stock: InMemoryStockRepository;
  cookieFor: (u: string) => string;
}> {
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
  const stock = new InMemoryStockRepository();
  const app = await buildApp({ config, authRepository: auth, stockRepository: stock });
  await app.ready();
  return { app, stock, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

interface InjectOptions {
  cookie?: string;
  payload?: unknown;
}
function inject(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH",
  url: string,
  { cookie, payload }: InjectOptions = {},
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method,
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });
}

const MALT_BODY = {
  name: "Malt Pale Ale",
  kind: "RECETTE",
  category: "MALT",
  unit: "GRAM",
  defaultUnitCostCents: 1,
  reorderThreshold: 1500,
};

describe("module stock — catalogue, lots & niveaux dérivés (M5-03)", () => {
  let app: FastifyInstance;
  let stock: InMemoryStockRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, stock, cookieFor } = await makeApp());
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const create = async (body: unknown = MALT_BODY, user = "brasseur"): Promise<string> => {
    const res = await inject(app, "POST", "/api/stock/items", {
      cookie: cookieFor(user),
      payload: body,
    });
    return res.json().item.id;
  };

  it("crée un article puis le relit avec son niveau dérivé", async () => {
    try {
      const res = await inject(app, "POST", "/api/stock/items", {
        cookie: cookieFor("brasseur"),
        payload: MALT_BODY,
      });
      expect(res.statusCode).toBe(201);
      const { item } = res.json();
      expect(item).toMatchObject({ name: "Malt Pale Ale", kind: "RECETTE", isActive: true });

      const read = await inject(app, "GET", `/api/stock/items/${item.id}`, {
        cookie: cookieFor("caisse"),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().item).toMatchObject({ id: item.id, level: 0, reservedOutstanding: 0 });
    } finally {
      await close();
    }
  });

  it("RECETTE sans catégorie → 400 (validation core)", async () => {
    try {
      const res = await inject(app, "POST", "/api/stock/items", {
        cookie: cookieFor("brasseur"),
        payload: { name: "Sans cat", kind: "RECETTE", unit: "GRAM" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION");
    } finally {
      await close();
    }
  });

  it("kind immuable au PATCH → 400, autres champs modifiables", async () => {
    try {
      const id = await create();
      const bad = await inject(app, "PATCH", `/api/stock/items/${id}`, {
        cookie: cookieFor("brasseur"),
        payload: { kind: "BULK" },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe("CATALOG_ITEM_KIND_IMMUTABLE");

      const ok = await inject(app, "PATCH", `/api/stock/items/${id}`, {
        cookie: cookieFor("brasseur"),
        payload: { defaultUnitCostCents: 3, reorderThreshold: 2000 },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().item).toMatchObject({ defaultUnitCostCents: 3, reorderThreshold: 2000 });
    } finally {
      await close();
    }
  });

  it("PATCH acceptant le même kind (no-op) reste autorisé", async () => {
    try {
      const id = await create();
      const res = await inject(app, "PATCH", `/api/stock/items/${id}`, {
        cookie: cookieFor("brasseur"),
        payload: { kind: "RECETTE", name: "Malt Pale Ale v2" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().item.name).toBe("Malt Pale Ale v2");
    } finally {
      await close();
    }
  });

  it("GET /stock/items expose level/reservedOutstanding/below cohérents", async () => {
    try {
      // RECETTE : mouvements +5000 −1000 = 4000, réservation 3000, seuil 1500
      //   → available = 4000 − 3000 = 1000 ≤ 1500 → below
      const maltId = await create();
      stock.seedMovement(maltId, 5000);
      stock.seedMovement(maltId, -1000);
      stock.seedReservation(maltId, 3000);

      // BULK : niveau 800, seuil 500 ; une réservation (9999) doit être IGNORÉE
      //   → available = 800 (pas 800 − 9999) → pas d'alerte
      const co2Id = await create(
        { name: "CO2 vrac", kind: "BULK", unit: "UNIT", reorderThreshold: 500 },
        "admin",
      );
      stock.seedMovement(co2Id, 800);
      stock.seedReservation(co2Id, 9999);

      const res = await inject(app, "GET", "/api/stock/items", { cookie: cookieFor("brasseur") });
      expect(res.statusCode).toBe(200);
      const { items, total } = res.json();
      expect(total).toBe(2);

      const malt = items.find((i: { id: string }) => i.id === maltId);
      expect(malt).toMatchObject({
        level: 4000,
        reservedOutstanding: 3000,
        available: 1000,
        below: true,
      });

      const co2 = items.find((i: { id: string }) => i.id === co2Id);
      expect(co2).toMatchObject({
        level: 800,
        reservedOutstanding: 9999,
        available: 800,
        below: false,
      });
    } finally {
      await close();
    }
  });

  it("filtre par kind", async () => {
    try {
      await create();
      await create({ name: "Bouteille 33cl", kind: "CONDITIONNEMENT", unit: "UNIT" }, "admin");
      const res = await inject(app, "GET", "/api/stock/items?kind=CONDITIONNEMENT", {
        cookie: cookieFor("brasseur"),
      });
      expect(res.json().items).toHaveLength(1);
      expect(res.json().items[0].name).toBe("Bouteille 33cl");
    } finally {
      await close();
    }
  });

  it("crée un lot, visible dans le détail de l'article", async () => {
    try {
      const id = await create();
      const res = await inject(app, "POST", `/api/stock/items/${id}/lots`, {
        cookie: cookieFor("brasseur"),
        payload: { lotCode: "L-2026-01", quantity: 25000, unitCostCents: 2 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().lot).toMatchObject({ lotCode: "L-2026-01", quantity: 25000 });

      const detail = await inject(app, "GET", `/api/stock/items/${id}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(detail.json().item.lots).toHaveLength(1);
      // Le lot ne crée pas de mouvement → niveau inchangé (M5-04 gère l'entrée).
      expect(detail.json().item.level).toBe(0);
    } finally {
      await close();
    }
  });

  it("article inexistant → 404 (détail, PATCH, création de lot)", async () => {
    try {
      const detail = await inject(app, "GET", "/api/stock/items/nope", {
        cookie: cookieFor("brasseur"),
      });
      expect(detail.statusCode).toBe(404);
      expect(detail.json().error.code).toBe("CATALOG_ITEM_NOT_FOUND");

      const patch = await inject(app, "PATCH", "/api/stock/items/nope", {
        cookie: cookieFor("brasseur"),
        payload: { name: "x" },
      });
      expect(patch.statusCode).toBe(404);

      const lot = await inject(app, "POST", "/api/stock/items/nope/lots", {
        cookie: cookieFor("brasseur"),
        payload: { quantity: 1 },
      });
      expect(lot.statusCode).toBe(404);
    } finally {
      await close();
    }
  });

  it("RBAC : caisse lit mais n'écrit pas ; anonyme refusé", async () => {
    try {
      const id = await create();
      expect(
        (await inject(app, "GET", "/api/stock/items", { cookie: cookieFor("caisse") })).statusCode,
      ).toBe(200);

      const caisseCreate = await inject(app, "POST", "/api/stock/items", {
        cookie: cookieFor("caisse"),
        payload: MALT_BODY,
      });
      expect(caisseCreate.statusCode).toBe(403);

      const caissePatch = await inject(app, "PATCH", `/api/stock/items/${id}`, {
        cookie: cookieFor("caisse"),
        payload: { reorderThreshold: 10 },
      });
      expect(caissePatch.statusCode).toBe(403);

      const caisseLot = await inject(app, "POST", `/api/stock/items/${id}/lots`, {
        cookie: cookieFor("caisse"),
        payload: { quantity: 1 },
      });
      expect(caisseLot.statusCode).toBe(403);

      const anon = await inject(app, "GET", "/api/stock/items");
      expect(anon.statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});

describe("module stock — mouvements manuels & inventaire (M5-04)", () => {
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, cookieFor } = await makeApp());
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const createBulk = async (): Promise<string> => {
    const res = await inject(app, "POST", "/api/stock/items", {
      cookie: cookieFor("brasseur"),
      payload: { name: "CO2 vrac", kind: "BULK", unit: "UNIT", reorderThreshold: 500 },
    });
    return res.json().item.id;
  };

  it("un mouvement manuel met à jour le niveau dérivé", async () => {
    try {
      const id = await createBulk();
      // Achat +2000, puis purge CO2 −150 (forfait BULK, reason ADJUSTMENT).
      const buy = await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("brasseur"),
        payload: { catalogItemId: id, delta: 2000, reason: "PURCHASE" },
      });
      expect(buy.statusCode).toBe(201);
      expect(buy.json()).toMatchObject({ level: 2000, movement: { delta: 2000 } });

      const purge = await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("brasseur"),
        payload: { catalogItemId: id, delta: -150, reason: "ADJUSTMENT", note: "purge" },
      });
      expect(purge.statusCode).toBe(201);
      expect(purge.json().level).toBe(1850);

      const detail = await inject(app, "GET", `/api/stock/items/${id}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(detail.json().item.level).toBe(1850);
    } finally {
      await close();
    }
  });

  it("PRODUCTION / SALE / delta=0 rejetés (400)", async () => {
    try {
      const id = await createBulk();
      for (const payload of [
        { catalogItemId: id, delta: 10, reason: "PRODUCTION" },
        { catalogItemId: id, delta: 10, reason: "SALE" },
        { catalogItemId: id, delta: 0, reason: "ADJUSTMENT" },
      ]) {
        const res = await inject(app, "POST", "/api/stock/movements", {
          cookie: cookieFor("brasseur"),
          payload,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe("VALIDATION");
      }
    } finally {
      await close();
    }
  });

  it("registre paginé, ordre createdAt desc", async () => {
    try {
      const id = await createBulk();
      for (const delta of [100, 200, -50]) {
        await inject(app, "POST", "/api/stock/movements", {
          cookie: cookieFor("brasseur"),
          payload: { catalogItemId: id, delta, reason: "ADJUSTMENT" },
        });
      }
      const res = await inject(app, "GET", `/api/stock/items/${id}/movements`, {
        cookie: cookieFor("caisse"),
      });
      expect(res.statusCode).toBe(200);
      const { movements, total } = res.json();
      expect(total).toBe(3);
      // Le plus récent (delta −50) en tête.
      expect(movements.map((m: { delta: number }) => m.delta)).toEqual([-50, 200, 100]);
    } finally {
      await close();
    }
  });

  it("inventaire : écart → mouvement INVENTORY au bon delta ; sans écart → unchanged", async () => {
    try {
      const withGap = await createBulk();
      const exact = await createBulk();
      // withGap : niveau 1000 puis compté 900 → delta −100.
      await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("brasseur"),
        payload: { catalogItemId: withGap, delta: 1000, reason: "PURCHASE" },
      });
      // exact : niveau 500 puis compté 500 → no-op.
      await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("brasseur"),
        payload: { catalogItemId: exact, delta: 500, reason: "PURCHASE" },
      });

      const res = await inject(app, "POST", "/api/stock/inventory", {
        cookie: cookieFor("brasseur"),
        payload: {
          counts: [
            { catalogItemId: withGap, countedQuantity: 900 },
            { catalogItemId: exact, countedQuantity: 500 },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const { lines } = res.json();

      const gapLine = lines.find((l: { catalogItemId: string }) => l.catalogItemId === withGap);
      expect(gapLine).toMatchObject({ previousLevel: 1000, countedQuantity: 900, delta: -100 });
      expect(gapLine.movementId).toBeTruthy();

      const exactLine = lines.find((l: { catalogItemId: string }) => l.catalogItemId === exact);
      expect(exactLine).toMatchObject({ previousLevel: 500, delta: 0 });
      expect(exactLine.movementId).toBeUndefined();

      // Le niveau de withGap est recalé à 900 et l'ajustement est tracé.
      const detail = await inject(app, "GET", `/api/stock/items/${withGap}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(detail.json().item.level).toBe(900);
      expect(detail.json().item.recentMovements[0].reason).toBe("INVENTORY");
    } finally {
      await close();
    }
  });

  it("inventaire transactionnel : un article inconnu → 404, aucune écriture", async () => {
    try {
      const id = await createBulk();
      await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("brasseur"),
        payload: { catalogItemId: id, delta: 1000, reason: "PURCHASE" },
      });

      const res = await inject(app, "POST", "/api/stock/inventory", {
        cookie: cookieFor("brasseur"),
        payload: {
          counts: [
            { catalogItemId: id, countedQuantity: 800 },
            { catalogItemId: "nope", countedQuantity: 10 },
          ],
        },
      });
      expect(res.statusCode).toBe(404);

      // Aucune écriture : le niveau du 1er article reste à 1000.
      const detail = await inject(app, "GET", `/api/stock/items/${id}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(detail.json().item.level).toBe(1000);
    } finally {
      await close();
    }
  });

  it("404 sur mouvement/registre d'un article inexistant", async () => {
    try {
      const mv = await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("brasseur"),
        payload: { catalogItemId: "nope", delta: 10, reason: "PURCHASE" },
      });
      expect(mv.statusCode).toBe(404);

      const reg = await inject(app, "GET", "/api/stock/items/nope/movements", {
        cookie: cookieFor("brasseur"),
      });
      expect(reg.statusCode).toBe(404);
    } finally {
      await close();
    }
  });

  it("RBAC : caisse ne peut ni bouger le stock ni saisir l'inventaire ; anon refusé", async () => {
    try {
      const id = await createBulk();
      const caisseMove = await inject(app, "POST", "/api/stock/movements", {
        cookie: cookieFor("caisse"),
        payload: { catalogItemId: id, delta: 10, reason: "PURCHASE" },
      });
      expect(caisseMove.statusCode).toBe(403);

      const caisseInv = await inject(app, "POST", "/api/stock/inventory", {
        cookie: cookieFor("caisse"),
        payload: { counts: [{ catalogItemId: id, countedQuantity: 1 }] },
      });
      expect(caisseInv.statusCode).toBe(403);

      // La caisse peut néanmoins lire le registre (stocks:read).
      const caisseRead = await inject(app, "GET", `/api/stock/items/${id}/movements`, {
        cookie: cookieFor("caisse"),
      });
      expect(caisseRead.statusCode).toBe(200);

      const anon = await inject(app, "POST", "/api/stock/movements", {
        payload: { catalogItemId: id, delta: 10, reason: "PURCHASE" },
      });
      expect(anon.statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});

describe("module stock — alertes de seuil (M5-06)", () => {
  let app: FastifyInstance;
  let stock: InMemoryStockRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, stock, cookieFor } = await makeApp());
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const create = async (body: unknown, user = "brasseur"): Promise<string> => {
    const res = await inject(app, "POST", "/api/stock/items", {
      cookie: cookieFor(user),
      payload: body,
    });
    return res.json().item.id;
  };

  it("ne remonte que les articles sous seuil, triés par criticité", async () => {
    try {
      // RECETTE Malt : niveau 4000, réservé 3000, seuil 1500 → dispo 1000 (crit −500).
      const malt = await create({
        name: "Malt Pale",
        kind: "RECETTE",
        category: "MALT",
        unit: "GRAM",
        reorderThreshold: 1500,
      });
      stock.seedMovement(malt, 5000);
      stock.seedMovement(malt, -1000);
      stock.seedReservation(malt, 3000);

      // BULK CO2 : niveau 400, seuil 500, une réservation IGNORÉE → dispo 400 (crit −100).
      const co2 = await create(
        { name: "CO2 vrac", kind: "BULK", unit: "UNIT", reorderThreshold: 500 },
        "admin",
      );
      stock.seedMovement(co2, 400);
      stock.seedReservation(co2, 9999);

      // RECETTE Houblon : niveau 5000, seuil 100 → au-dessus, pas d'alerte.
      const hop = await create({
        name: "Houblon",
        kind: "RECETTE",
        category: "HOP",
        unit: "GRAM",
        reorderThreshold: 100,
      });
      stock.seedMovement(hop, 5000);

      // Article sans seuil → jamais candidat.
      const eau = await create({ name: "Eau", kind: "BULK", unit: "LITER" });
      stock.seedMovement(eau, 0);

      const res = await inject(app, "GET", "/api/stock/alerts", { cookie: cookieFor("brasseur") });
      expect(res.statusCode).toBe(200);
      const { items } = res.json();
      // Malt (crit −500) avant CO2 (crit −100) ; hop et eau absents.
      expect(items.map((i: { id: string }) => i.id)).toEqual([malt, co2]);
      expect(items[0]).toMatchObject({
        name: "Malt Pale",
        kind: "RECETTE",
        level: 4000,
        available: 1000,
        reorderThreshold: 1500,
      });
      // BULK : disponible = niveau (réservation ignorée).
      expect(items[1]).toMatchObject({ kind: "BULK", level: 400, available: 400 });
    } finally {
      await close();
    }
  });

  it("aucune alerte quand tout est au-dessus du seuil", async () => {
    try {
      const id = await create({
        name: "Malt",
        kind: "RECETTE",
        category: "MALT",
        unit: "GRAM",
        reorderThreshold: 100,
      });
      stock.seedMovement(id, 5000);
      const res = await inject(app, "GET", "/api/stock/alerts", { cookie: cookieFor("caisse") });
      expect(res.json().items).toEqual([]);
    } finally {
      await close();
    }
  });

  it("RBAC : caisse lit les alertes ; anonyme refusé", async () => {
    try {
      expect(
        (await inject(app, "GET", "/api/stock/alerts", { cookie: cookieFor("caisse") })).statusCode,
      ).toBe(200);
      expect((await inject(app, "GET", "/api/stock/alerts")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});
