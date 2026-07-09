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

/** Repo recette minimal : seul `findById` sert au service batch ; le reste n'est pas sollicité. */
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
  const { recipeSnapshot: _s, ...rest } = b;
  return rest;
}

class InMemoryBatchRepository implements BatchRepository {
  private store = new Map<string, BatchDetailView>();
  private seq = 0;

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
  create(data: BatchCreateData): Promise<BatchDetailView> {
    const now = new Date();
    const batch: BatchDetailView = {
      id: `batch_${this.seq + 1}`,
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
    };
    this.store.set(batch.id, batch);
    return Promise.resolve(batch);
  }
  updateStatus(id: string, status: BatchDetailView["status"]): Promise<BatchDetailView> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`batch ${id} absent (le service garantit son existence)`);
    const updated = { ...existing, status, updatedAt: new Date() };
    this.store.set(id, updated);
    return Promise.resolve(updated);
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
    ingredients: [
      {
        id: "i1",
        catalogItemId: null,
        name: "Pale Ale",
        category: "MALT",
        use: null,
        amount: 5000,
        unit: "GRAM",
        timeMinutes: null,
        sortOrder: 0,
        params: { isMashable: true, potentialSg: 1.037, colorEbc: 4 },
      },
    ],
    steps: [{ id: "s1", type: "BOIL", name: null, sortOrder: 0, params: { timeMin: 60 } }],
    ...over,
  };
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
};

async function makeApp(recipes: StubRecipeRepository): Promise<{
  app: FastifyInstance;
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
  const app = await buildApp({
    config,
    authRepository: auth,
    recipeRepository: recipes,
    batchRepository: new InMemoryBatchRepository(),
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

describe("module batches — planification (M3-04)", () => {
  let app: FastifyInstance;
  let recipes: StubRecipeRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    recipes = new StubRecipeRepository();
    ({ app, cookieFor } = await makeApp(recipes));
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
      // Le snapshot fige la recette complète (ingrédients inclus).
      expect(batch.recipeSnapshot.name).toBe("IPA maison");
      expect(batch.recipeSnapshot.ingredients).toHaveLength(1);
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

  it("liste et annule un batch ; une seconde annulation est refusée (409)", async () => {
    try {
      recipes.insert(publishedRecipe());
      const id = (await plan({ recipeId: "rec-1" })).json().batch.id;

      const list = await inject(app, "GET", "/api/batches?status=PLANIFIE", {
        cookie: cookieFor("brasseur"),
      });
      expect(list.json().batches).toHaveLength(1);

      const cancel = await inject(app, "POST", `/api/batches/${id}/cancel`, {
        cookie: cookieFor("brasseur"),
      });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().batch.status).toBe("ANNULE");

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
