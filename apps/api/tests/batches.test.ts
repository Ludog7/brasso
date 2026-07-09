import { createHash } from "node:crypto";

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
  BatchCreateData,
  BatchDetailView,
  BatchListFilters,
  BatchRepository,
  BatchSummaryView,
  ReservationInput,
} from "../src/modules/batches/repository.js";
import type { RecipeRepository, RecipeWithDetails } from "../src/modules/recipes/repository.js";
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

/** Repo recette minimal : seul `findById` sert au service batch. */
class StubRecipeRepository implements RecipeRepository {
  private store = new Map<string, RecipeWithDetails>();
  insert(recipe: RecipeWithDetails): void {
    this.store.set(recipe.id, recipe);
  }
  mutateName(id: string, name: string): void {
    const r = this.store.get(id);
    if (r) this.store.set(id, { ...r, name });
  }
  findById(id: string): Promise<RecipeWithDetails | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  list(): never {
    throw new Error("non sollicité");
  }
  create(): never {
    throw new Error("non sollicité");
  }
  update(): never {
    throw new Error("non sollicité");
  }
  delete(): never {
    throw new Error("non sollicité");
  }
  replaceIngredients(): never {
    throw new Error("non sollicité");
  }
  replaceSteps(): never {
    throw new Error("non sollicité");
  }
  updateStatus(): never {
    throw new Error("non sollicité");
  }
  findDraftInFamily(): never {
    throw new Error("non sollicité");
  }
  createNextVersion(): never {
    throw new Error("non sollicité");
  }
}

function summaryOf(b: BatchDetailView): BatchSummaryView {
  const { recipeSnapshot: _s, reservations: _r, ...rest } = b;
  return rest;
}

class InMemoryBatchRepository implements BatchRepository {
  private store = new Map<string, BatchDetailView>();
  private stock = new Map<string, number>();
  private seq = 0;

  /** Amorce un stock disponible pour un article (tests de warning). */
  setStock(catalogItemId: string, quantity: number): void {
    this.stock.set(catalogItemId, quantity);
  }

  list(filters: BatchListFilters): Promise<BatchSummaryView[]> {
    let items = [...this.store.values()];
    if (filters.status) items = items.filter((b) => b.status === filters.status);
    if (filters.recipeId) items = items.filter((b) => b.recipeId === filters.recipeId);
    items.sort((a, b) => b.batchNumber - a.batchNumber);
    return Promise.resolve(items.map(summaryOf));
  }
  findById(id: string): Promise<BatchDetailView | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  create(
    data: BatchCreateData,
    reservations: ReservationInput[],
    _createdById: string | null,
  ): Promise<BatchDetailView> {
    const now = new Date();
    const id = `batch_${this.seq + 1}`;
    const batch: BatchDetailView = {
      id,
      batchNumber: ++this.seq,
      recipeId: data.recipeId,
      recipeVersion: data.recipeVersion,
      recipeSnapshot: data.recipeSnapshot,
      equipmentProfileId: data.equipmentProfileId,
      status: "PLANIFIE",
      plannedAt: data.plannedAt,
      brewedAt: null,
      fermentedAt: null,
      packagedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      reservations: reservations.map((r, i) => ({
        id: `${id}_res_${i}`,
        catalogItemId: r.catalogItemId,
        quantity: r.quantity,
        status: "RESERVED",
      })),
    };
    this.store.set(id, batch);
    return Promise.resolve(batch);
  }
  cancel(id: string): Promise<BatchDetailView> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`batch ${id} absent (le service garantit son existence)`);
    const updated: BatchDetailView = {
      ...existing,
      status: "ANNULE",
      updatedAt: new Date(),
      reservations: existing.reservations.map((r) =>
        r.status === "RESERVED" ? { ...r, status: "RELEASED" } : r,
      ),
    };
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }
  availableByItem(catalogItemIds: string[]): Promise<Map<string, number>> {
    return Promise.resolve(new Map(catalogItemIds.map((id) => [id, this.stock.get(id) ?? 0])));
  }
}

function publishedRecipe(over: Partial<RecipeWithDetails> = {}): RecipeWithDetails {
  const now = new Date("2026-07-06T10:00:00Z");
  return {
    id: "rec-1",
    familyId: "fam-1",
    version: 2,
    name: "IPA maison",
    engine: "BEER",
    status: "PUBLISHED",
    notes: null,
    createdAt: now,
    updatedAt: now,
    beerDetails: {
      styleBjcp: "21A",
      targetOg: 1.06,
      targetFg: 1.012,
      targetIbu: 50,
      targetEbc: 20,
      boilTimeMin: 60,
      efficiency: 0.72,
      batchVolumeL: 20,
    },
    altDetails: null,
    softDetails: null,
    ingredients: [ingredient("i1", "Pale Ale", null, 5000)],
    steps: [{ id: "s1", type: "BOIL", name: null, sortOrder: 0, params: { timeMin: 60 } }],
    ...over,
  };
}

function ingredient(
  id: string,
  name: string,
  catalogItemId: string | null,
  amount: number,
): RecipeWithDetails["ingredients"][number] {
  return {
    id,
    catalogItemId,
    name,
    category: "MALT",
    use: null,
    amount,
    unit: "GRAM",
    timeMinutes: null,
    sortOrder: 0,
    params: {},
  };
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
};

async function makeApp(
  recipes: StubRecipeRepository,
  batches: InMemoryBatchRepository,
): Promise<{ app: FastifyInstance; cookieFor: (u: string) => string }> {
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
    recipeRepository: recipes,
    batchRepository: batches,
  });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

interface InjectOptions {
  cookie?: string;
  payload?: unknown;
}
function inject(
  app: FastifyInstance,
  method: "GET" | "POST",
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

describe("module batches — planification & réservation (M3-04/M3-05)", () => {
  let app: FastifyInstance;
  let recipes: StubRecipeRepository;
  let batches: InMemoryBatchRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    recipes = new StubRecipeRepository();
    batches = new InMemoryBatchRepository();
    ({ app, cookieFor } = await makeApp(recipes, batches));
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const plan = (payload: unknown, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", "/api/batches", { cookie: cookieFor(user), payload });

  it("planifie un batch depuis une recette publiée (snapshot + version + numéro)", async () => {
    try {
      recipes.insert(publishedRecipe());
      const res = await plan({ recipeId: "rec-1", equipmentProfileId: "eq-1" });
      expect(res.statusCode).toBe(201);
      const { batch } = res.json();
      expect(batch).toMatchObject({
        recipeId: "rec-1",
        recipeVersion: 2,
        equipmentProfileId: "eq-1",
        status: "PLANIFIE",
      });
      expect(batch.batchNumber).toBeGreaterThan(0);
      expect(batch.recipeSnapshot.name).toBe("IPA maison");
    } finally {
      await close();
    }
  });

  it("refuse la planification depuis une recette non publiée (409)", async () => {
    try {
      recipes.insert(publishedRecipe({ status: "DRAFT" }));
      const res = await plan({ recipeId: "rec-1" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("RECIPE_NOT_PUBLISHED");
    } finally {
      await close();
    }
  });

  it("recette inexistante → 404", async () => {
    try {
      const res = await plan({ recipeId: "absent" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    } finally {
      await close();
    }
  });

  it("le snapshot est immuable : une modification ultérieure de la recette n'affecte pas le batch", async () => {
    try {
      recipes.insert(publishedRecipe());
      const id = (await plan({ recipeId: "rec-1" })).json().batch.id;
      recipes.mutateName("rec-1", "IPA renommée");
      const read = await inject(app, "GET", `/api/batches/${id}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(read.json().batch.recipeSnapshot.name).toBe("IPA maison");
    } finally {
      await close();
    }
  });

  it("réserve le stock des ingrédients catalogués ; liste les non catalogués", async () => {
    try {
      recipes.insert(
        publishedRecipe({
          ingredients: [
            ingredient("i1", "Pilsner", "cat-malt", 4000),
            ingredient("i2", "Saaz", "cat-hop", 30),
            ingredient("i3", "Gingembre frais", null, 200), // hors catalogue
          ],
        }),
      );
      batches.setStock("cat-malt", 10000);
      batches.setStock("cat-hop", 500);

      const res = await plan({ recipeId: "rec-1" });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      const reserved = body.batch.reservations;
      expect(reserved).toHaveLength(2);
      expect(reserved.every((r: { status: string }) => r.status === "RESERVED")).toBe(true);
      expect(reserved.map((r: { catalogItemId: string }) => r.catalogItemId)).toEqual(
        expect.arrayContaining(["cat-malt", "cat-hop"]),
      );
      expect(body.unreservedIngredients).toEqual(["Gingembre frais"]);
      expect(body.stockWarnings).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("stock insuffisant → avertissement non bloquant (batch quand même planifié)", async () => {
    try {
      recipes.insert(
        publishedRecipe({ ingredients: [ingredient("i1", "Pilsner", "cat-malt", 4000)] }),
      );
      batches.setStock("cat-malt", 1000); // < 4000 requis

      const res = await plan({ recipeId: "rec-1" });
      expect(res.statusCode).toBe(201); // non bloquant
      const body = res.json();
      expect(body.stockWarnings).toHaveLength(1);
      expect(body.stockWarnings[0]).toMatchObject({
        catalogItemId: "cat-malt",
        requested: 4000,
        available: 1000,
      });
      // La réservation est tout de même posée (déduction réelle = M5).
      expect(body.batch.reservations).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("annulation : réservations passées en RELEASED ; seconde annulation refusée (409)", async () => {
    try {
      recipes.insert(
        publishedRecipe({ ingredients: [ingredient("i1", "Pilsner", "cat-malt", 4000)] }),
      );
      batches.setStock("cat-malt", 10000);
      const id = (await plan({ recipeId: "rec-1" })).json().batch.id;

      const cancel = await inject(app, "POST", `/api/batches/${id}/cancel`, {
        cookie: cookieFor("brasseur"),
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().batch.status).toBe("ANNULE");
      expect(cancel.json().batch.reservations[0].status).toBe("RELEASED");

      const again = await inject(app, "POST", `/api/batches/${id}/cancel`, {
        cookie: cookieFor("brasseur"),
      });
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe("BATCH_NOT_CANCELABLE");
    } finally {
      await close();
    }
  });

  it("RBAC : caisse lit mais ne planifie pas ; anonyme refusé", async () => {
    try {
      recipes.insert(publishedRecipe());
      expect(
        (await inject(app, "GET", "/api/batches", { cookie: cookieFor("caisse") })).statusCode,
      ).toBe(200);
      expect((await plan({ recipeId: "rec-1" }, "caisse")).statusCode).toBe(403);
      expect((await inject(app, "GET", "/api/batches")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});
