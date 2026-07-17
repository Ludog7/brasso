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
  DisplayRepository,
  ScreenItemRecord,
  ScreenRecord,
  ScreenRenderData,
  ScreenWriteData,
  SurfaceRecord,
  SurfaceWriteData,
} from "../src/modules/display/repository.js";
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

// ── Repository mémoire ────────────────────────────────────────────────────────

class InMemoryDisplayRepository implements DisplayRepository {
  readonly surfaces: SurfaceRecord[] = [];
  readonly screens: ScreenRecord[] = [];
  /** screenId → sélection de produits. */
  readonly items = new Map<string, ScreenItemRecord[]>();
  /** catalogItemId → libellé (produit existant au catalogue). */
  readonly catalog = new Map<string, string>();
  /** catalogItemId → niveau de stock dérivé (somme des `delta`). */
  readonly stock = new Map<string, number>();
  private seq = 0;

  seedCatalogItem(id: string, name: string, level = 0): void {
    this.catalog.set(id, name);
    this.stock.set(id, level);
  }
  setStock(id: string, level: number): void {
    this.stock.set(id, level);
  }

  // Surfaces
  listSurfaces(): Promise<SurfaceRecord[]> {
    return Promise.resolve([...this.surfaces].sort((a, b) => a.name.localeCompare(b.name)));
  }
  findSurfaceById(id: string): Promise<SurfaceRecord | null> {
    return Promise.resolve(this.surfaces.find((s) => s.id === id) ?? null);
  }
  findSurfaceByName(name: string): Promise<{ id: string } | null> {
    const s = this.surfaces.find((x) => x.name === name);
    return Promise.resolve(s ? { id: s.id } : null);
  }
  createSurface(data: SurfaceWriteData): Promise<SurfaceRecord> {
    const now = new Date();
    const row: SurfaceRecord = { id: `srf${++this.seq}`, ...data, createdAt: now, updatedAt: now };
    this.surfaces.push(row);
    return Promise.resolve(row);
  }
  updateSurface(id: string, data: Partial<SurfaceWriteData>): Promise<SurfaceRecord> {
    const row = this.surfaces.find((s) => s.id === id)!;
    Object.assign(row, data);
    row.updatedAt = new Date();
    return Promise.resolve(row);
  }
  deleteSurface(id: string): Promise<void> {
    const i = this.surfaces.findIndex((s) => s.id === id);
    if (i >= 0) this.surfaces.splice(i, 1);
    // Cascade schéma : écrans de la surface + leurs produits.
    for (const scr of this.screens.filter((s) => s.surfaceId === id)) {
      this.items.delete(scr.id);
    }
    for (let j = this.screens.length - 1; j >= 0; j--) {
      if (this.screens[j]!.surfaceId === id) this.screens.splice(j, 1);
    }
    return Promise.resolve();
  }

  // Écrans
  listScreens(surfaceId: string): Promise<ScreenRecord[]> {
    return Promise.resolve(this.screens.filter((s) => s.surfaceId === surfaceId));
  }
  findScreenById(id: string): Promise<ScreenRecord | null> {
    return Promise.resolve(this.screens.find((s) => s.id === id) ?? null);
  }
  createScreen(surfaceId: string, data: ScreenWriteData): Promise<ScreenRecord> {
    const now = new Date();
    const row: ScreenRecord = {
      id: `scr${++this.seq}`,
      surfaceId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.screens.push(row);
    return Promise.resolve(row);
  }
  updateScreen(id: string, data: Partial<ScreenWriteData>): Promise<ScreenRecord> {
    const row = this.screens.find((s) => s.id === id)!;
    Object.assign(row, data);
    row.updatedAt = new Date();
    return Promise.resolve(row);
  }
  deleteScreen(id: string): Promise<void> {
    const i = this.screens.findIndex((s) => s.id === id);
    if (i >= 0) this.screens.splice(i, 1);
    this.items.delete(id);
    return Promise.resolve();
  }

  // Produits
  existingCatalogItemIds(ids: string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(ids.filter((id) => this.catalog.has(id))));
  }
  replaceScreenItems(screenId: string, items: ScreenItemRecord[]): Promise<void> {
    this.items.set(
      screenId,
      items.map((i) => ({ ...i })),
    );
    return Promise.resolve();
  }

  // Rendu
  getScreenRenderData(screenId: string): Promise<ScreenRenderData | null> {
    const screen = this.screens.find((s) => s.id === screenId);
    if (!screen) return Promise.resolve(null);
    const surface = this.surfaces.find((s) => s.id === screen.surfaceId)!;
    const items = (this.items.get(screenId) ?? []).map((i) => ({
      ...i,
      name: this.catalog.get(i.catalogItemId) ?? "?",
    }));
    return Promise.resolve({ screen, surface: { id: surface.id, name: surface.name }, items });
  }
  stockLevelsFor(catalogItemIds: string[]): Promise<Record<string, number>> {
    const levels: Record<string, number> = {};
    for (const id of catalogItemIds) {
      if (this.stock.has(id)) levels[id] = this.stock.get(id)!;
    }
    return Promise.resolve(levels);
  }
}

// ── Auth mémoire + harnais ────────────────────────────────────────────────────

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

async function makeApp(
  display: InMemoryDisplayRepository,
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
  const app = await buildApp({ config, authRepository: auth, displayRepository: display });
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

// Raccourci : crée une surface + un écran, renvoie leurs ids.
async function seedSurfaceScreen(
  app: FastifyInstance,
  cookie: string,
  screen: Record<string, unknown> = {},
): Promise<{ surfaceId: string; screenId: string }> {
  const s = await req(app, "POST", "/api/display/surfaces", cookie, { name: "Bar" });
  const surfaceId = (s.json() as { surface: SurfaceRecord }).surface.id;
  const sc = await req(app, "POST", `/api/display/surfaces/${surfaceId}/screens`, cookie, {
    name: "Écran principal",
    legalMentions: "L'abus d'alcool est dangereux pour la santé.",
    ...screen,
  });
  const screenId = (sc.json() as { screen: ScreenRecord }).screen.id;
  return { surfaceId, screenId };
}

// ── CRUD surfaces & écrans ────────────────────────────────────────────────────

describe("CRUD surfaces & écrans (M7-08)", () => {
  let display: InMemoryDisplayRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    display = new InMemoryDisplayRepository();
    ({ app, cookieFor } = await makeApp(display));
  });

  it("admin crée une surface puis un écran (template par défaut CARDS) → 201", async () => {
    const s = await req(app, "POST", "/api/display/surfaces", cookieFor("admin"), {
      name: "Bar",
      description: "Comptoir principal",
    });
    expect(s.statusCode).toBe(201);
    const surface = (s.json() as { surface: SurfaceRecord }).surface;
    expect(surface).toMatchObject({
      name: "Bar",
      description: "Comptoir principal",
      isActive: true,
    });

    const sc = await req(
      app,
      "POST",
      `/api/display/surfaces/${surface.id}/screens`,
      cookieFor("admin"),
      {
        name: "Écran 1",
        legalMentions: "Mentions",
      },
    );
    expect(sc.statusCode).toBe(201);
    expect((sc.json() as { screen: ScreenRecord }).screen).toMatchObject({
      surfaceId: surface.id,
      name: "Écran 1",
      template: "CARDS",
      legalMentions: "Mentions",
      isActive: true,
    });
  });

  it("409 DISPLAY_SURFACE_CONFLICT sur nom de surface dupliqué", async () => {
    await req(app, "POST", "/api/display/surfaces", cookieFor("admin"), { name: "Bar" });
    const dup = await req(app, "POST", "/api/display/surfaces", cookieFor("admin"), {
      name: "Bar",
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("DISPLAY_SURFACE_CONFLICT");
    expect(display.surfaces).toHaveLength(1);
  });

  it("PATCH surface (renommage libre, réutilise l'ancien nom sans conflit) ; 404 si absente", async () => {
    const { surfaceId } = await seedSurfaceScreen(app, cookieFor("admin"));
    const patched = await req(
      app,
      "PATCH",
      `/api/display/surfaces/${surfaceId}`,
      cookieFor("admin"),
      {
        name: "Bar",
        isActive: false,
      },
    );
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { surface: SurfaceRecord }).surface.isActive).toBe(false);

    const missing = await req(app, "PATCH", "/api/display/surfaces/nope", cookieFor("admin"), {
      name: "X",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("DISPLAY_SURFACE_NOT_FOUND");
  });

  it("liste les écrans d'une surface ; 404 si la surface est absente", async () => {
    const { surfaceId } = await seedSurfaceScreen(app, cookieFor("admin"));
    const list = await req(
      app,
      "GET",
      `/api/display/surfaces/${surfaceId}/screens`,
      cookieFor("admin"),
    );
    expect(list.statusCode).toBe(200);
    expect((list.json() as { screens: ScreenRecord[] }).screens).toHaveLength(1);

    const missing = await req(
      app,
      "GET",
      "/api/display/surfaces/ghost/screens",
      cookieFor("admin"),
    );
    expect(missing.statusCode).toBe(404);
  });

  it("créer un écran sous une surface absente → 404", async () => {
    const res = await req(app, "POST", "/api/display/surfaces/ghost/screens", cookieFor("admin"), {
      name: "Écran",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("DISPLAY_SURFACE_NOT_FOUND");
  });

  it("PATCH/DELETE sur écran absent → 404 DISPLAY_SCREEN_NOT_FOUND", async () => {
    const patch = await req(app, "PATCH", "/api/display/screens/nope", cookieFor("admin"), {
      template: "TABLE",
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json().error.code).toBe("DISPLAY_SCREEN_NOT_FOUND");

    const del = await req(app, "DELETE", "/api/display/screens/nope", cookieFor("admin"));
    expect(del.statusCode).toBe(404);
  });

  it("DELETE surface → 204 et cascade sur ses écrans", async () => {
    const { surfaceId, screenId } = await seedSurfaceScreen(app, cookieFor("admin"));
    const del = await req(app, "DELETE", `/api/display/surfaces/${surfaceId}`, cookieFor("admin"));
    expect(del.statusCode).toBe(204);
    expect(display.surfaces).toHaveLength(0);
    expect(display.screens.find((s) => s.id === screenId)).toBeUndefined();
  });
});

// ── Produits d'un écran (PUT remplace la sélection) ────────────────────────────

describe("sélection de produits d'un écran (M7-08)", () => {
  let display: InMemoryDisplayRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;
  let screenId: string;

  beforeEach(async () => {
    display = new InMemoryDisplayRepository();
    display.seedCatalogItem("cat-blonde", "Blonde 33cl", 24);
    display.seedCatalogItem("cat-ipa", "IPA 33cl", 12);
    ({ app, cookieFor } = await makeApp(display));
    ({ screenId } = await seedSurfaceScreen(app, cookieFor("admin")));
  });

  it("PUT items remplace la sélection (idempotent sur le contenu)", async () => {
    const first = await req(
      app,
      "PUT",
      `/api/display/screens/${screenId}/items`,
      cookieFor("admin"),
      {
        items: [
          { catalogItemId: "cat-blonde", isFavorite: true, priceCents: 450, sortOrder: 1 },
          { catalogItemId: "cat-ipa", isNew: true, priceCents: 500, sortOrder: 2 },
        ],
      },
    );
    expect(first.statusCode).toBe(200);
    expect((first.json() as { count: number }).count).toBe(2);

    // Remplacement complet : une seule ligne restante.
    const second = await req(
      app,
      "PUT",
      `/api/display/screens/${screenId}/items`,
      cookieFor("admin"),
      {
        items: [{ catalogItemId: "cat-blonde", priceCents: 450 }],
      },
    );
    expect((second.json() as { count: number }).count).toBe(1);
    expect(display.items.get(screenId)).toHaveLength(1);
  });

  it("PUT items avec catalogItemId inexistant → 404 CATALOG_ITEM_NOT_FOUND (rien remplacé)", async () => {
    const res = await req(
      app,
      "PUT",
      `/api/display/screens/${screenId}/items`,
      cookieFor("admin"),
      {
        items: [{ catalogItemId: "ghost" }],
      },
    );
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("CATALOG_ITEM_NOT_FOUND");
    expect(display.items.get(screenId)).toBeUndefined();
  });

  it("PUT items avec doublon de catalogItemId → 400 VALIDATION", async () => {
    const res = await req(
      app,
      "PUT",
      `/api/display/screens/${screenId}/items`,
      cookieFor("admin"),
      {
        items: [{ catalogItemId: "cat-blonde" }, { catalogItemId: "cat-blonde" }],
      },
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION");
  });

  it("PUT items sur écran absent → 404 DISPLAY_SCREEN_NOT_FOUND", async () => {
    const res = await req(app, "PUT", "/api/display/screens/nope/items", cookieFor("admin"), {
      items: [],
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("DISPLAY_SCREEN_NOT_FOUND");
  });
});

// ── Rendu synchronisé au stock ────────────────────────────────────────────────

interface RenderBody {
  screen: {
    id: string;
    name: string;
    template: string;
    legalMentions: string | null;
    surface: { id: string; name: string };
  };
  items: {
    catalogItemId: string;
    name: string;
    priceCents: number | null;
    flags: { isNew: boolean; isFavorite: boolean; isSpecial: boolean };
    sortOrder: number;
  }[];
  syncedAt: string;
  syncToken: string;
}

describe("rendu synchronisé au stock (M7-08, cœur démo)", () => {
  let display: InMemoryDisplayRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;
  let screenId: string;

  beforeEach(async () => {
    display = new InMemoryDisplayRepository();
    display.seedCatalogItem("cat-blonde", "Blonde 33cl", 24);
    display.seedCatalogItem("cat-ipa", "IPA 33cl", 8);
    display.seedCatalogItem("cat-rupture", "Ambrée 33cl", 0); // en rupture
    ({ app, cookieFor } = await makeApp(display));
    ({ screenId } = await seedSurfaceScreen(app, cookieFor("admin"), { template: "LIST" }));
    await req(app, "PUT", `/api/display/screens/${screenId}/items`, cookieFor("admin"), {
      items: [
        { catalogItemId: "cat-ipa", isNew: true, priceCents: 500, sortOrder: 2 },
        { catalogItemId: "cat-blonde", isFavorite: true, priceCents: 450, sortOrder: 1 },
        { catalogItemId: "cat-rupture", priceCents: 480, sortOrder: 3 },
      ],
    });
  });

  it("n'expose que les produits stock > 0, triés par sortOrder, avec flags/prix/mentions/template + jeton", async () => {
    const res = await req(
      app,
      "GET",
      `/api/display/screens/${screenId}/render`,
      cookieFor("admin"),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as RenderBody;

    // Le produit en rupture (cat-rupture, stock 0) est absent ; ordre par sortOrder.
    expect(body.items.map((i) => i.catalogItemId)).toEqual(["cat-blonde", "cat-ipa"]);
    expect(body.items[0]).toMatchObject({
      name: "Blonde 33cl",
      priceCents: 450,
      flags: { isNew: false, isFavorite: true, isSpecial: false },
    });
    expect(body.items[1]?.flags.isNew).toBe(true);

    // Métadonnées d'écran + mentions légales (texte libre) + template.
    expect(body.screen).toMatchObject({
      template: "LIST",
      legalMentions: "L'abus d'alcool est dangereux pour la santé.",
      surface: { name: "Bar" },
    });
    expect(typeof body.syncToken).toBe("string");
    expect(body.syncToken).toHaveLength(64);
  });

  it("un produit qui tombe à 0 disparaît du rendu et fait changer le jeton de synchro", async () => {
    const before = (
      await req(app, "GET", `/api/display/screens/${screenId}/render`, cookieFor("admin"))
    ).json() as RenderBody;
    expect(before.items.map((i) => i.catalogItemId)).toContain("cat-ipa");

    display.setStock("cat-ipa", 0); // vente épuise le stock

    const after = (
      await req(app, "GET", `/api/display/screens/${screenId}/render`, cookieFor("admin"))
    ).json() as RenderBody;
    expect(after.items.map((i) => i.catalogItemId)).not.toContain("cat-ipa");
    expect(after.syncToken).not.toBe(before.syncToken);
  });

  it("render sur écran absent → 404", async () => {
    const res = await req(app, "GET", "/api/display/screens/nope/render", cookieFor("admin"));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("DISPLAY_SCREEN_NOT_FOUND");
  });
});

// ── RBAC affichage ────────────────────────────────────────────────────────────

describe("RBAC affichage (M7-08)", () => {
  let display: InMemoryDisplayRepository;
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;
  let surfaceId: string;
  let screenId: string;

  beforeEach(async () => {
    display = new InMemoryDisplayRepository();
    display.seedCatalogItem("cat-blonde", "Blonde 33cl", 24);
    ({ app, cookieFor } = await makeApp(display));
    ({ surfaceId, screenId } = await seedSurfaceScreen(app, cookieFor("admin")));
  });

  it("lecture (GET surfaces / render) : admin/brasseur/caisse oui, rgpd non", async () => {
    for (const role of ["admin", "brasseur", "caisse"]) {
      expect((await req(app, "GET", "/api/display/surfaces", cookieFor(role))).statusCode).toBe(
        200,
      );
      expect(
        (await req(app, "GET", `/api/display/screens/${screenId}/render`, cookieFor(role)))
          .statusCode,
      ).toBe(200);
    }
    expect((await req(app, "GET", "/api/display/surfaces", cookieFor("rgpd"))).statusCode).toBe(
      403,
    );
  });

  it("mise à jour (PATCH écran, PUT items) : admin/brasseur/caisse oui (RU), rgpd non", async () => {
    for (const role of ["admin", "brasseur", "caisse"]) {
      expect(
        (
          await req(app, "PATCH", `/api/display/screens/${screenId}`, cookieFor(role), {
            isActive: true,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await req(app, "PUT", `/api/display/screens/${screenId}/items`, cookieFor(role), {
            items: [{ catalogItemId: "cat-blonde", priceCents: 450 }],
          })
        ).statusCode,
      ).toBe(200);
    }
    expect(
      (
        await req(app, "PATCH", `/api/display/screens/${screenId}`, cookieFor("rgpd"), {
          isActive: true,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("création/suppression : admin seul ; brasseur/caisse non (RU, pas CRUD) ; rgpd non", async () => {
    for (const role of ["brasseur", "caisse", "rgpd"]) {
      expect(
        (await req(app, "POST", "/api/display/surfaces", cookieFor(role), { name: `S-${role}` }))
          .statusCode,
      ).toBe(403);
      expect(
        (await req(app, "DELETE", `/api/display/surfaces/${surfaceId}`, cookieFor(role)))
          .statusCode,
      ).toBe(403);
      expect(
        (await req(app, "DELETE", `/api/display/screens/${screenId}`, cookieFor(role))).statusCode,
      ).toBe(403);
    }
    // admin peut créer.
    expect(
      (await req(app, "POST", "/api/display/surfaces", cookieFor("admin"), { name: "Salle" }))
        .statusCode,
    ).toBe(201);
  });

  it("refuse un utilisateur non authentifié → 401", async () => {
    expect((await req(app, "GET", "/api/display/surfaces", undefined)).statusCode).toBe(401);
  });
});
