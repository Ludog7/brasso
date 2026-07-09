import { createHash } from "node:crypto";

import type { RecipeIngredientInput, RecipeStatus, RecipeStepInput } from "@brasso/core";
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
  BeerDetailsView,
  RecipeCreateData,
  RecipeListFilters,
  RecipeRepository,
  RecipeSummary,
  RecipeUpdateData,
  RecipeWithDetails,
} from "../src/modules/recipes/repository.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// Repositories en mémoire (hermétiques, sans base) — même approche que rbac.test.
// ─────────────────────────────────────────────────────────────────────────────

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

function toSummary(r: RecipeWithDetails): RecipeSummary {
  const {
    beerDetails: _b,
    altDetails: _a,
    softDetails: _s,
    ingredients: _i,
    steps: _st,
    ...rest
  } = r;
  return rest;
}

class InMemoryRecipeRepository implements RecipeRepository {
  private store = new Map<string, RecipeWithDetails>();
  private seq = 0;

  /** Insère une recette pré-construite (ex. un `PUBLISHED` pour tester le 409). */
  insert(recipe: RecipeWithDetails): void {
    this.store.set(recipe.id, recipe);
  }

  list(filters: RecipeListFilters): Promise<RecipeSummary[]> {
    let items = [...this.store.values()];
    if (filters.engine) items = items.filter((r) => r.engine === filters.engine);
    if (filters.status) items = items.filter((r) => r.status === filters.status);
    if (filters.familyId) items = items.filter((r) => r.familyId === filters.familyId);
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return Promise.resolve(items.map(toSummary));
  }

  findById(id: string): Promise<RecipeWithDetails | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  create(data: RecipeCreateData): Promise<RecipeWithDetails> {
    const now = new Date();
    const recipe: RecipeWithDetails = {
      id: `rec_${++this.seq}`,
      familyId: data.familyId,
      version: 1,
      name: data.name,
      engine: data.engine,
      status: "DRAFT",
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
      beerDetails: data.beerDetails
        ? {
            styleBjcp: data.beerDetails.styleBjcp ?? null,
            targetOg: data.beerDetails.targetOg ?? null,
            targetFg: data.beerDetails.targetFg ?? null,
            targetIbu: data.beerDetails.targetIbu ?? null,
            targetEbc: data.beerDetails.targetEbc ?? null,
            boilTimeMin: data.beerDetails.boilTimeMin ?? null,
            efficiency: data.beerDetails.efficiency ?? null,
            batchVolumeL: data.beerDetails.batchVolumeL ?? null,
          }
        : null,
      altDetails: data.altDetails
        ? {
            baseType: data.altDetails.baseType,
            targetPh: data.altDetails.targetPh ?? null,
            stabilizationMethod: data.altDetails.stabilizationMethod ?? null,
            residualSugarRisk: data.altDetails.residualSugarRisk,
            batchVolumeL: data.altDetails.batchVolumeL ?? null,
          }
        : null,
      softDetails: data.softDetails
        ? {
            sugarConcentration: data.softDetails.sugarConcentration ?? null,
            targetPh: data.softDetails.targetPh ?? null,
            storageMode: data.softDetails.storageMode ?? null,
            stabilizationMethod: data.softDetails.stabilizationMethod ?? null,
            batchVolumeL: data.softDetails.batchVolumeL ?? null,
          }
        : null,
      ingredients: [],
      steps: [],
    };
    this.store.set(recipe.id, recipe);
    return Promise.resolve(recipe);
  }

  update(id: string, data: RecipeUpdateData): Promise<RecipeWithDetails> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`recette ${id} absente (le service garantit son existence)`);
    }
    const updated: RecipeWithDetails = { ...existing, updatedAt: new Date() };
    if (data.name !== undefined) updated.name = data.name;
    if (data.notes !== undefined) updated.notes = data.notes;
    if (data.beerDetails && updated.beerDetails) {
      updated.beerDetails = { ...updated.beerDetails, ...data.beerDetails };
    }
    if (data.altDetails && updated.altDetails) {
      updated.altDetails = { ...updated.altDetails, ...data.altDetails };
    }
    if (data.softDetails && updated.softDetails) {
      updated.softDetails = { ...updated.softDetails, ...data.softDetails };
    }
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }

  delete(id: string): Promise<void> {
    this.store.delete(id);
    return Promise.resolve();
  }

  replaceIngredients(recipeId: string, items: RecipeIngredientInput[]): Promise<RecipeWithDetails> {
    const existing = this.store.get(recipeId);
    if (!existing) {
      throw new Error(`recette ${recipeId} absente (le service garantit son existence)`);
    }
    const updated: RecipeWithDetails = {
      ...existing,
      updatedAt: new Date(),
      ingredients: items.map((it, index) => ({
        id: `${recipeId}_ing_${index}`,
        catalogItemId: it.catalogItemId ?? null,
        name: it.name,
        category: it.category,
        use: it.use ?? null,
        amount: it.amount,
        unit: it.unit,
        timeMinutes: it.timeMinutes ?? null,
        sortOrder: index,
        params: it.params ?? null,
      })),
    };
    this.store.set(recipeId, updated);
    return Promise.resolve(updated);
  }

  replaceSteps(recipeId: string, items: RecipeStepInput[]): Promise<RecipeWithDetails> {
    const existing = this.store.get(recipeId);
    if (!existing) {
      throw new Error(`recette ${recipeId} absente (le service garantit son existence)`);
    }
    const updated: RecipeWithDetails = {
      ...existing,
      updatedAt: new Date(),
      steps: items.map((it, index) => ({
        id: `${recipeId}_step_${index}`,
        type: it.type,
        name: it.name ?? null,
        sortOrder: index,
        params: it.params ?? null,
      })),
    };
    this.store.set(recipeId, updated);
    return Promise.resolve(updated);
  }

  updateStatus(id: string, status: RecipeStatus): Promise<RecipeWithDetails> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`recette ${id} absente (le service garantit son existence)`);
    }
    const updated: RecipeWithDetails = { ...existing, status, updatedAt: new Date() };
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }

  findDraftInFamily(familyId: string): Promise<RecipeSummary | null> {
    const draft = [...this.store.values()].find(
      (r) => r.familyId === familyId && r.status === "DRAFT",
    );
    return Promise.resolve(draft ? toSummary(draft) : null);
  }

  createNextVersion(sourceId: string): Promise<RecipeWithDetails> {
    const src = this.store.get(sourceId);
    if (!src) {
      throw new Error(`recette ${sourceId} absente (le service garantit son existence)`);
    }
    const nextVersion =
      Math.max(
        ...[...this.store.values()]
          .filter((r) => r.familyId === src.familyId)
          .map((r) => r.version),
      ) + 1;
    const id = `rec_${++this.seq}`;
    const copy: RecipeWithDetails = {
      ...src,
      id,
      version: nextVersion,
      status: "DRAFT",
      createdAt: new Date(),
      updatedAt: new Date(),
      beerDetails: src.beerDetails ? { ...src.beerDetails } : null,
      altDetails: src.altDetails ? { ...src.altDetails } : null,
      softDetails: src.softDetails ? { ...src.softDetails } : null,
      ingredients: src.ingredients.map((i, index) => ({ ...i, id: `${id}_ing_${index}` })),
      steps: src.steps.map((s, index) => ({ ...s, id: `${id}_step_${index}` })),
    };
    this.store.set(id, copy);
    return Promise.resolve(copy);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Harnais : app + un user par rôle utile (admin, brasseur, caisse).
// ─────────────────────────────────────────────────────────────────────────────

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
};

async function makeApp(): Promise<{
  app: FastifyInstance;
  recipes: InMemoryRecipeRepository;
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

  const recipes = new InMemoryRecipeRepository();
  const app = await buildApp({ config, authRepository: auth, recipeRepository: recipes });
  await app.ready();

  return { app, recipes, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

interface InjectOptions {
  cookie?: string;
  payload?: unknown;
}

function inject(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH" | "DELETE",
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

// Corps de création de référence par moteur.
const BEER_BODY = {
  engine: "BEER",
  name: "Pale Ale maison",
  beerDetails: { styleBjcp: "18B", targetOg: 1.052, targetFg: 1.01, efficiency: 0.72 },
};
const ALT_BODY = {
  engine: "ALT_FERMENTED",
  name: "Ginger beer",
  altDetails: { baseType: "gingembre", targetPh: 3.4, stabilizationMethod: "PASTEURIZATION" },
};
const SOFT_BODY = {
  engine: "SOFT_DRINK",
  name: "Limonade",
  softDetails: { sugarConcentration: 90, targetPh: 3.0, storageMode: "cold" },
};

describe("module recipes — CRUD des brouillons (M2-01)", () => {
  let app: FastifyInstance;
  let recipes: InMemoryRecipeRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, recipes, cookieFor } = await makeApp());
  });

  // Nettoyage : Fastify ferme les connexions après chaque test.
  const close = async (): Promise<void> => {
    await app.close();
  };

  it("crée puis relit une recette DRAFT de chaque moteur (critère fonctionnel)", async () => {
    try {
      for (const body of [BEER_BODY, ALT_BODY, SOFT_BODY]) {
        const created = await inject(app, "POST", "/api/recipes", {
          cookie: cookieFor("brasseur"),
          payload: body,
        });
        expect(created.statusCode, `POST ${body.engine}`).toBe(201);
        const { recipe } = created.json();
        expect(recipe).toMatchObject({
          engine: body.engine,
          name: body.name,
          status: "DRAFT",
          version: 1,
        });
        expect(recipe.id).toBeTruthy();
        expect(recipe.familyId).toBeTruthy();

        const read = await inject(app, "GET", `/api/recipes/${recipe.id}`, {
          cookie: cookieFor("brasseur"),
        });
        expect(read.statusCode).toBe(200);
        expect(read.json().recipe).toMatchObject({ id: recipe.id, engine: body.engine });
      }
    } finally {
      await close();
    }
  });

  it("BEER : les cibles moteur sont persistées et relues", async () => {
    try {
      const created = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("admin"),
        payload: BEER_BODY,
      });
      const { recipe } = created.json();
      expect(recipe.beerDetails).toMatchObject({
        styleBjcp: "18B",
        targetOg: 1.052,
        targetFg: 1.01,
        efficiency: 0.72,
      });
      // Détails des autres moteurs absents (polymorphisme 1-1, ADR-06).
      expect(recipe.altDetails).toBeNull();
      expect(recipe.softDetails).toBeNull();
      expect(recipe.ingredients).toEqual([]);
      expect(recipe.steps).toEqual([]);
    } finally {
      await close();
    }
  });

  it("liste : filtre par moteur, tri par updatedAt desc", async () => {
    try {
      await inject(app, "POST", "/api/recipes", { cookie: cookieFor("admin"), payload: BEER_BODY });
      await inject(app, "POST", "/api/recipes", { cookie: cookieFor("admin"), payload: ALT_BODY });

      const all = await inject(app, "GET", "/api/recipes", { cookie: cookieFor("caisse") });
      expect(all.statusCode).toBe(200);
      expect(all.json().recipes).toHaveLength(2);

      const beers = await inject(app, "GET", "/api/recipes?engine=BEER", {
        cookie: cookieFor("caisse"),
      });
      expect(beers.json().recipes).toHaveLength(1);
      expect(beers.json().recipes[0].engine).toBe("BEER");
    } finally {
      await close();
    }
  });

  it("PATCH d'un DRAFT : met à jour le commun et le détail moteur", async () => {
    try {
      const created = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("brasseur"),
        payload: BEER_BODY,
      });
      const id = created.json().recipe.id;

      const patched = await inject(app, "PATCH", `/api/recipes/${id}`, {
        cookie: cookieFor("brasseur"),
        payload: { name: "Pale Ale v2", beerDetails: { targetIbu: 35 } },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().recipe).toMatchObject({ name: "Pale Ale v2" });
      expect(patched.json().recipe.beerDetails).toMatchObject({
        styleBjcp: "18B", // inchangé
        targetIbu: 35, // modifié
      });
    } finally {
      await close();
    }
  });

  it("PATCH avec un détail d'un autre moteur → 400 (schéma strict)", async () => {
    try {
      const created = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("brasseur"),
        payload: ALT_BODY,
      });
      const id = created.json().recipe.id;

      const bad = await inject(app, "PATCH", `/api/recipes/${id}`, {
        cookie: cookieFor("brasseur"),
        payload: { beerDetails: { targetIbu: 20 } },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toMatchObject({ error: { code: "VALIDATION" } });
    } finally {
      await close();
    }
  });

  it("DELETE d'un DRAFT → 204 puis 404 en relecture", async () => {
    try {
      const created = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("brasseur"),
        payload: SOFT_BODY,
      });
      const id = created.json().recipe.id;

      const del = await inject(app, "DELETE", `/api/recipes/${id}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(del.statusCode).toBe(204);

      const read = await inject(app, "GET", `/api/recipes/${id}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(read.statusCode).toBe(404);
      expect(read.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    } finally {
      await close();
    }
  });

  it("PATCH/DELETE d'une recette non-DRAFT → 409 (immuabilité ADR-06)", async () => {
    try {
      const now = new Date();
      recipes.insert({
        id: "pub_1",
        familyId: "fam_pub",
        version: 1,
        name: "Recette publiée",
        engine: "BEER",
        status: "PUBLISHED",
        notes: null,
        createdAt: now,
        updatedAt: now,
        beerDetails: {
          styleBjcp: null,
          targetOg: null,
          targetFg: null,
          targetIbu: null,
          targetEbc: null,
          boilTimeMin: null,
          efficiency: null,
          batchVolumeL: null,
        } satisfies BeerDetailsView,
        altDetails: null,
        softDetails: null,
        ingredients: [],
        steps: [],
      });

      const patch = await inject(app, "PATCH", "/api/recipes/pub_1", {
        cookie: cookieFor("admin"),
        payload: { name: "tentative" },
      });
      expect(patch.statusCode).toBe(409);
      expect(patch.json()).toMatchObject({ error: { code: "RECIPE_NOT_DRAFT" } });

      const del = await inject(app, "DELETE", "/api/recipes/pub_1", { cookie: cookieFor("admin") });
      expect(del.statusCode).toBe(409);
    } finally {
      await close();
    }
  });

  it("GET d'un id inexistant → 404", async () => {
    try {
      const res = await inject(app, "GET", "/api/recipes/nope", { cookie: cookieFor("caisse") });
      expect(res.statusCode).toBe(404);
    } finally {
      await close();
    }
  });

  it("POST invalide (nom manquant) → 400", async () => {
    try {
      const res = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("brasseur"),
        payload: { engine: "BEER", beerDetails: {} },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "VALIDATION" } });
    } finally {
      await close();
    }
  });

  it("POST ALT sans baseType → 400 (contrainte du schéma core)", async () => {
    try {
      const res = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("brasseur"),
        payload: { engine: "ALT_FERMENTED", name: "x", altDetails: {} },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await close();
    }
  });

  // ── RBAC (matrice §3.5) ────────────────────────────────────────────────────

  it("caisse : lecture autorisée, création interdite (403)", async () => {
    try {
      const read = await inject(app, "GET", "/api/recipes", { cookie: cookieFor("caisse") });
      expect(read.statusCode).toBe(200);

      const create = await inject(app, "POST", "/api/recipes", {
        cookie: cookieFor("caisse"),
        payload: BEER_BODY,
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    } finally {
      await close();
    }
  });

  it("non authentifié → 401", async () => {
    try {
      const res = await inject(app, "POST", "/api/recipes", { payload: BEER_BODY });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    } finally {
      await close();
    }
  });

  // ── Sous-ressources : ingrédients & étapes (M2-02) ──────────────────────────

  const createRecipe = async (payload: unknown): Promise<string> => {
    const res = await inject(app, "POST", "/api/recipes", {
      cookie: cookieFor("brasseur"),
      payload,
    });
    return res.json().recipe.id;
  };

  const MALTS_AND_HOPS: RecipeIngredientInput[] = [
    {
      category: "MALT",
      name: "Pilsner",
      amount: 4000,
      params: { colorEbc: 4, potentialSg: 1.037 },
    },
    {
      category: "HOP",
      name: "Saaz",
      amount: 30,
      use: "BOIL",
      timeMinutes: 60,
      params: { alphaFraction: 0.035 },
    },
  ];

  it("BEER : PUT ingredients pose malts + houblons, ordonnés (critère fonctionnel)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const res = await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: { ingredients: MALTS_AND_HOPS },
      });
      expect(res.statusCode).toBe(200);
      const { ingredients } = res.json().recipe;
      expect(ingredients).toHaveLength(2);
      expect(ingredients.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([0, 1]);
      expect(ingredients[0]).toMatchObject({ category: "MALT", name: "Pilsner" });
      expect(ingredients[1]).toMatchObject({ category: "HOP", params: { alphaFraction: 0.035 } });
    } finally {
      await close();
    }
  });

  it("BEER : PUT steps pose un palier d'empâtage + ébullition, ordonnés", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const steps: RecipeStepInput[] = [
        { type: "MASH_STEP", name: "Saccharification", params: { tempC: 67, timeMin: 60 } },
        { type: "BOIL", params: { timeMin: 60 } },
      ];
      const res = await inject(app, "PUT", `/api/recipes/${id}/steps`, {
        cookie: cookieFor("brasseur"),
        payload: { steps },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().recipe.steps).toHaveLength(2);
      expect(res.json().recipe.steps[0]).toMatchObject({ type: "MASH_STEP", sortOrder: 0 });
    } finally {
      await close();
    }
  });

  it("ALT : PUT steps accepte une étape stabilize (critère fonctionnel)", async () => {
    try {
      const id = await createRecipe(ALT_BODY);
      const res = await inject(app, "PUT", `/api/recipes/${id}/steps`, {
        cookie: cookieFor("brasseur"),
        payload: { steps: [{ type: "STABILIZE", params: { method: "PASTEURIZATION" } }] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().recipe.steps[0]).toMatchObject({ type: "STABILIZE" });
    } finally {
      await close();
    }
  });

  it("un second PUT remplace intégralement (pas d'accumulation)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: { ingredients: MALTS_AND_HOPS },
      });
      const res = await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: { ingredients: [{ category: "MALT", name: "Vienna", amount: 1000 }] },
      });
      expect(res.json().recipe.ingredients).toHaveLength(1);
      expect(res.json().recipe.ingredients[0]).toMatchObject({ name: "Vienna" });
    } finally {
      await close();
    }
  });

  it("ALT : un houblon est rejeté (400, incohérent avec le moteur)", async () => {
    try {
      const id = await createRecipe(ALT_BODY);
      const res = await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: {
          ingredients: [
            {
              category: "HOP",
              name: "Saaz",
              amount: 10,
              use: "BOIL",
              params: { alphaFraction: 0.04 },
            },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "ENGINE_MISMATCH" } });
    } finally {
      await close();
    }
  });

  it("BEER : une étape STABILIZE est rejetée (400, réservée ALT/SOFT)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const res = await inject(app, "PUT", `/api/recipes/${id}/steps`, {
        cookie: cookieFor("brasseur"),
        payload: { steps: [{ type: "STABILIZE" }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "ENGINE_MISMATCH" } });
    } finally {
      await close();
    }
  });

  it("houblon sans α → 400 (validation de params par catégorie)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const res = await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: {
          ingredients: [{ category: "HOP", name: "Saaz", amount: 10, use: "BOIL", params: {} }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "VALIDATION" } });
    } finally {
      await close();
    }
  });

  it("PUT sur une recette non-DRAFT → 409", async () => {
    try {
      const now = new Date();
      recipes.insert({
        id: "pub_2",
        familyId: "fam_pub2",
        version: 1,
        name: "Publiée",
        engine: "BEER",
        status: "PUBLISHED",
        notes: null,
        createdAt: now,
        updatedAt: now,
        beerDetails: {
          styleBjcp: null,
          targetOg: null,
          targetFg: null,
          targetIbu: null,
          targetEbc: null,
          boilTimeMin: null,
          efficiency: null,
          batchVolumeL: null,
        } satisfies BeerDetailsView,
        altDetails: null,
        softDetails: null,
        ingredients: [],
        steps: [],
      });
      const res = await inject(app, "PUT", "/api/recipes/pub_2/ingredients", {
        cookie: cookieFor("brasseur"),
        payload: { ingredients: [] },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await close();
    }
  });

  it("caisse ne peut pas modifier les sous-ressources (403)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const res = await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("caisse"),
        payload: { ingredients: [] },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await close();
    }
  });

  // ── Versioning & publication (M2-03) ────────────────────────────────────────

  const publish = (id: string, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", `/api/recipes/${id}/publish`, { cookie: cookieFor(user) });

  it("BEER : publie un DRAFT (DRAFT → PUBLISHED)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const res = await publish(id);
      expect(res.statusCode).toBe(200);
      expect(res.json().recipe).toMatchObject({ id, status: "PUBLISHED" });
    } finally {
      await close();
    }
  });

  it("ALT sans stabilisation → 422 avec la liste des manquements", async () => {
    try {
      const id = await createRecipe({
        engine: "ALT_FERMENTED",
        name: "Ginger",
        altDetails: { baseType: "gingembre", targetPh: 3.4 }, // pas de stabilizationMethod
      });
      const res = await publish(id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("NOT_PUBLISHABLE");
      expect(res.json().error.details.errors.join(" ")).toContain("Stabilisation obligatoire");
    } finally {
      await close();
    }
  });

  it("ALT complète (pH + stabilisation) → publiable", async () => {
    try {
      const id = await createRecipe(ALT_BODY); // porte stabilizationMethod + targetPh
      expect((await publish(id)).statusCode).toBe(200);
    } finally {
      await close();
    }
  });

  it("cycle complet : v1 publiée, v2 DRAFT, modifiée, republiée — v1 intacte", async () => {
    try {
      const v1 = await createRecipe(BEER_BODY);
      await inject(app, "PUT", `/api/recipes/${v1}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: { ingredients: MALTS_AND_HOPS },
      });
      expect((await publish(v1)).statusCode).toBe(200);

      // Nouvelle version : copie profonde en DRAFT v2.
      const nv = await inject(app, "POST", `/api/recipes/${v1}/new-version`, {
        cookie: cookieFor("brasseur"),
      });
      expect(nv.statusCode).toBe(201);
      const v2 = nv.json().recipe;
      expect(v2).toMatchObject({ version: 2, status: "DRAFT" });
      expect(v2.familyId).toBe(nv.json().recipe.familyId);
      expect(v2.id).not.toBe(v1);
      // Copie profonde : les ingrédients ont suivi.
      expect(v2.ingredients).toHaveLength(2);

      // Modifier v2 puis republier.
      await inject(app, "PATCH", `/api/recipes/${v2.id}`, {
        cookie: cookieFor("brasseur"),
        payload: { name: "Pale Ale v2" },
      });
      expect((await publish(v2.id)).statusCode).toBe(200);

      // v1 reste intacte (PUBLISHED, nom d'origine).
      const readV1 = await inject(app, "GET", `/api/recipes/${v1}`, {
        cookie: cookieFor("brasseur"),
      });
      expect(readV1.json().recipe).toMatchObject({ status: "PUBLISHED", name: "Pale Ale maison" });
    } finally {
      await close();
    }
  });

  it("new-version : refusée si un DRAFT existe déjà dans la famille (409)", async () => {
    try {
      const v1 = await createRecipe(BEER_BODY);
      await publish(v1);
      expect(
        (
          await inject(app, "POST", `/api/recipes/${v1}/new-version`, {
            cookie: cookieFor("brasseur"),
          })
        ).statusCode,
      ).toBe(201);
      // Un DRAFT (v2) existe désormais → seconde tentative refusée.
      const second = await inject(app, "POST", `/api/recipes/${v1}/new-version`, {
        cookie: cookieFor("brasseur"),
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("DRAFT_ALREADY_EXISTS");
    } finally {
      await close();
    }
  });

  it("new-version : refusée depuis un DRAFT (409, source non publiée)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      const res = await inject(app, "POST", `/api/recipes/${id}/new-version`, {
        cookie: cookieFor("brasseur"),
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("RECIPE_NOT_PUBLISHED");
    } finally {
      await close();
    }
  });

  it("archive : PUBLISHED → ARCHIVED, puis immuable (PATCH → 409)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      await publish(id);
      const arch = await inject(app, "POST", `/api/recipes/${id}/archive`, {
        cookie: cookieFor("admin"),
      });
      expect(arch.statusCode).toBe(200);
      expect(arch.json().recipe.status).toBe("ARCHIVED");

      // Immuabilité : plus aucune écriture.
      const patch = await inject(app, "PATCH", `/api/recipes/${id}`, {
        cookie: cookieFor("admin"),
        payload: { name: "x" },
      });
      expect(patch.statusCode).toBe(409);
    } finally {
      await close();
    }
  });

  it("publier puis re-publier → 409 (transition invalide)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      await publish(id);
      // La recette est PUBLISHED : republier repasse par requireDraft → 409.
      expect((await publish(id)).statusCode).toBe(409);
    } finally {
      await close();
    }
  });

  it("caisse ne peut pas publier (403)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      expect((await publish(id, "caisse")).statusCode).toBe(403);
    } finally {
      await close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Import / export (M2-12)
// ─────────────────────────────────────────────────────────────────────────────

/** BeerXML minimal valide (moteur BEER) pour les imports. */
const BEERXML_IMPORT = `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES><RECIPE>
<NAME>APA importee</NAME><VERSION>1</VERSION><TYPE>All Grain</TYPE>
<BATCH_SIZE>20.0</BATCH_SIZE><BOIL_SIZE>24.0</BOIL_SIZE><BOIL_TIME>60</BOIL_TIME><EFFICIENCY>72.0</EFFICIENCY>
<FERMENTABLES><FERMENTABLE><NAME>Pale Malt</NAME><VERSION>1</VERSION><TYPE>Grain</TYPE><AMOUNT>5.0</AMOUNT><YIELD>80.0</YIELD><COLOR>3.0</COLOR></FERMENTABLE></FERMENTABLES>
<HOPS><HOP><NAME>Cascade</NAME><VERSION>1</VERSION><ALPHA>6.0</ALPHA><AMOUNT>0.03</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP></HOPS>
<YEASTS><YEAST><NAME>US-05</NAME><VERSION>1</VERSION><ATTENUATION>78.0</ATTENUATION></YEAST></YEASTS>
</RECIPE></RECIPES>`;

describe("module recipes — import/export (M2-12)", () => {
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, cookieFor } = await makeApp());
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const createRecipe = async (payload: unknown): Promise<string> => {
    const res = await inject(app, "POST", "/api/recipes", { cookie: cookieFor("brasseur"), payload });
    return res.json().recipe.id;
  };

  const exportReq = (id: string, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "GET", `/api/recipes/${id}/export`, { cookie: cookieFor(user) });

  const importXml = (
    xml: string,
    user: string | null = "brasseur",
  ): ReturnType<FastifyInstance["inject"]> =>
    app.inject({
      method: "POST",
      url: "/api/recipes/import",
      headers: { "content-type": "application/xml" },
      payload: xml,
      ...(user ? { cookies: { [SESSION_COOKIE]: cookieFor(user) } } : {}),
    });

  const importJson = (
    body: unknown,
    user: string | null = "brasseur",
  ): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", "/api/recipes/import", {
      ...(user ? { cookie: cookieFor(user) } : {}),
      payload: body,
    });

  it("exporte chaque moteur avec le bon content-type et un nom de fichier", async () => {
    try {
      const cases = [
        { body: BEER_BODY, ext: ".xml", type: "application/xml" },
        { body: ALT_BODY, ext: ".json", type: "application/json" },
        { body: SOFT_BODY, ext: ".json", type: "application/json" },
      ];
      for (const { body, ext, type } of cases) {
        const id = await createRecipe(body);
        const res = await exportReq(id);
        expect(res.statusCode, body.engine).toBe(200);
        expect(res.headers["content-type"]).toContain(type);
        expect(res.headers["content-disposition"]).toContain(ext);
      }
    } finally {
      await close();
    }
  });

  it("exporte une BEER en BeerXML et une ALT en brasso-recipe v1", async () => {
    try {
      const beerId = await createRecipe(BEER_BODY);
      const beer = await exportReq(beerId);
      expect(beer.body.trimStart()).toMatch(/^<\?xml/);
      expect(beer.body).toContain("<RECIPE>");

      const altId = await createRecipe(ALT_BODY);
      const alt = await exportReq(altId);
      const envelope = JSON.parse(alt.body);
      expect(envelope).toMatchObject({
        format: "brasso-recipe",
        formatVersion: 1,
        engine: "ALT_FERMENTED",
      });
      expect(envelope.recipe.altDetails.baseType).toBe("gingembre");
    } finally {
      await close();
    }
  });

  it("importe un BeerXML → nouveau DRAFT BEER avec ses ingrédients", async () => {
    try {
      const res = await importXml(BEERXML_IMPORT);
      expect(res.statusCode).toBe(201);
      const { recipe } = res.json();
      expect(recipe).toMatchObject({ engine: "BEER", status: "DRAFT", version: 1 });
      const categories = recipe.ingredients.map((i: { category: string }) => i.category);
      expect(categories).toEqual(expect.arrayContaining(["MALT", "HOP", "YEAST"]));
    } finally {
      await close();
    }
  });

  it("importe un JSON brasso-recipe (ALT) → nouveau DRAFT, nouvelle famille", async () => {
    try {
      const srcId = await createRecipe(ALT_BODY);
      const exported = JSON.parse((await exportReq(srcId)).body);

      const res = await importJson(exported);
      expect(res.statusCode).toBe(201);
      const { recipe } = res.json();
      expect(recipe).toMatchObject({ engine: "ALT_FERMENTED", status: "DRAFT", version: 1 });
      expect(recipe.altDetails).toMatchObject({ baseType: "gingembre", targetPh: 3.4 });
      // Nouvelle famille : import = recette indépendante, pas une version de la source.
      const src = await inject(app, "GET", `/api/recipes/${srcId}`, { cookie: cookieFor("brasseur") });
      expect(recipe.familyId).not.toBe(src.json().recipe.familyId);
    } finally {
      await close();
    }
  });

  it("critère fonctionnel : export BEER → réimport → aller-retour idempotent (prévisions préservées)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      await inject(app, "PATCH", `/api/recipes/${id}`, {
        cookie: cookieFor("brasseur"),
        payload: { beerDetails: { batchVolumeL: 20, boilTimeMin: 60, efficiency: 0.72 } },
      });
      await inject(app, "PUT", `/api/recipes/${id}/ingredients`, {
        cookie: cookieFor("brasseur"),
        payload: {
          ingredients: [
            { category: "MALT", name: "Pale", amount: 5000, params: { isMashable: true, potentialSg: 1.037, colorEbc: 4 } },
            { category: "HOP", name: "Cascade", amount: 30, use: "BOIL", timeMinutes: 60, params: { alphaFraction: 0.06 } },
            { category: "YEAST", name: "US-05", amount: 11, params: { attenuationPct: 78 } },
          ],
        },
      });
      const published = await inject(app, "POST", `/api/recipes/${id}/publish`, {
        cookie: cookieFor("brasseur"),
      });
      expect(published.statusCode).toBe(200);

      const xml1 = (await exportReq(id)).body;
      const imported = await importXml(xml1);
      expect(imported.statusCode).toBe(201);
      const reimported = imported.json().recipe;
      expect(reimported.id).not.toBe(id);
      expect(reimported).toMatchObject({ engine: "BEER", status: "DRAFT", version: 1 });

      // Ré-exporter le DRAFT réimporté redonne le même BeerXML : tous les intrants
      // de calcul (potentiel, α, temps, atténuation, volume, rendement) sont conservés.
      const xml2 = (await exportReq(reimported.id)).body;
      expect(xml2).toBe(xml1);
    } finally {
      await close();
    }
  });

  it("fichier BeerXML invalide → 422 avec chemins des champs fautifs", async () => {
    try {
      const invalid = BEERXML_IMPORT.replace(/<BATCH_SIZE>[^<]*<\/BATCH_SIZE>/, "");
      const res = await importXml(invalid);
      expect(res.statusCode).toBe(422);
      const { error } = res.json();
      expect(error.code).toBe("IMPORT_INVALID");
      expect(error.details.paths).toContain("RECIPE/BATCH_SIZE");
    } finally {
      await close();
    }
  });

  it("JSON brasso-recipe invalide / moteur BEER / version inconnue → 422", async () => {
    try {
      const base = { format: "brasso-recipe", formatVersion: 1 };
      const payloadInvalid = { ...base, engine: "ALT_FERMENTED", recipe: {} };
      expect((await importJson(payloadInvalid)).statusCode).toBe(422);

      const payloadBeer = { ...base, engine: "BEER", recipe: {} };
      const beerRes = await importJson(payloadBeer);
      expect(beerRes.statusCode).toBe(422);
      expect(beerRes.json().error.code).toBe("IMPORT_INVALID");

      const payloadVersion = { format: "brasso-recipe", formatVersion: 99, engine: "ALT_FERMENTED", recipe: {} };
      expect((await importJson(payloadVersion)).statusCode).toBe(422);
    } finally {
      await close();
    }
  });

  it("RBAC : export lisible par caisse, refusé sans session ; import réservé à (recipes, create)", async () => {
    try {
      const id = await createRecipe(BEER_BODY);
      expect((await exportReq(id, "caisse")).statusCode).toBe(200);

      const anon = await inject(app, "GET", `/api/recipes/${id}/export`);
      expect(anon.statusCode).toBe(401);

      expect((await importXml(BEERXML_IMPORT, "caisse")).statusCode).toBe(403);
      expect((await importXml(BEERXML_IMPORT, null)).statusCode).toBe(401);
      expect((await importXml(BEERXML_IMPORT, "brasseur")).statusCode).toBe(201);
    } finally {
      await close();
    }
  });
});
