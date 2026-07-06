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
  CatalogItemView,
  CatalogListFilters,
  CatalogListResult,
  CatalogRepository,
} from "../src/modules/referentials/repository.js";
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

const CATALOG: CatalogItemView[] = [
  {
    id: "cat-malt-pilsner",
    name: "Malt Pilsner",
    kind: "RECETTE",
    category: "MALT",
    unit: "GRAM",
    attributes: { potentialSg: 1.037, colorEbc: 3.5 },
    defaultUnitCostCents: null,
    reorderThreshold: 5000,
  },
  {
    id: "cat-hop-cascade",
    name: "Cascade",
    kind: "RECETTE",
    category: "HOP",
    unit: "GRAM",
    attributes: { alphaAcid: 0.055, form: "PELLET" },
    defaultUnitCostCents: 5,
    reorderThreshold: 200,
  },
  {
    id: "cat-yeast-us05",
    name: "SafAle US-05",
    kind: "RECETTE",
    category: "YEAST",
    unit: "GRAM",
    attributes: { attenuationPct: 81 },
    defaultUnitCostCents: 30,
    reorderThreshold: 100,
  },
  {
    id: "cat-pkg-bottle-33",
    name: "Bouteille 33 cl",
    kind: "CONDITIONNEMENT",
    category: null,
    unit: "UNIT",
    attributes: { volumeL: 0.33 },
    defaultUnitCostCents: 30,
    reorderThreshold: 200,
  },
];

/** Repository catalogue en mémoire : filtre + pagination, comme la version Prisma. */
class InMemoryCatalogRepository implements CatalogRepository {
  constructor(private readonly items: CatalogItemView[] = CATALOG) {}

  list(filters: CatalogListFilters): Promise<CatalogListResult> {
    let rows = [...this.items];
    if (filters.kind) rows = rows.filter((i) => i.kind === filters.kind);
    if (filters.category) rows = rows.filter((i) => i.category === filters.category);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(q));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const total = rows.length;
    const items = rows.slice(filters.offset, filters.offset + filters.limit);
    return Promise.resolve({ items, total });
  }
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

async function makeApp(): Promise<{ app: FastifyInstance; cookieFor: (u: string) => string }> {
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
    catalogRepository: new InMemoryCatalogRepository(),
  });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

function get(
  app: FastifyInstance,
  url: string,
  cookie?: string,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method: "GET",
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
  });
}

describe("référentiels éditeur (M2-04)", () => {
  let app: FastifyInstance;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, cookieFor } = await makeApp());
  });
  const close = (): Promise<void> => app.close();

  // ── Styles BJCP (RBAC recettes.read) ────────────────────────────────────────

  it("GET /api/bjcp-styles?search=21A → plages du style seedé (critère fonctionnel)", async () => {
    try {
      const res = await get(app, "/api/bjcp-styles?search=21A", cookieFor("brasseur"));
      expect(res.statusCode).toBe(200);
      expect(res.json().styles).toHaveLength(1);
      expect(res.json().styles[0]).toMatchObject({
        code: "21A",
        name: "American IPA",
        ogMin: 1.056,
        ibuMax: 70,
      });
    } finally {
      await close();
    }
  });

  it("recherche BJCP par nom", async () => {
    try {
      const res = await get(app, "/api/bjcp-styles?search=stout", cookieFor("caisse"));
      expect(res.statusCode).toBe(200);
      expect(res.json().styles.map((s: { code: string }) => s.code)).toContain("15B");
    } finally {
      await close();
    }
  });

  it("sans search → tous les styles", async () => {
    try {
      const res = await get(app, "/api/bjcp-styles", cookieFor("brasseur"));
      expect(res.json().styles.length).toBeGreaterThan(5);
    } finally {
      await close();
    }
  });

  it("BJCP : caisse (R sur recettes) autorisée, non authentifié → 401", async () => {
    try {
      expect((await get(app, "/api/bjcp-styles", cookieFor("caisse"))).statusCode).toBe(200);
      expect((await get(app, "/api/bjcp-styles")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });

  it("BJCP : rôle sans droit sur recettes (rgpd) → 403", async () => {
    try {
      expect((await get(app, "/api/bjcp-styles", cookieFor("rgpd"))).statusCode).toBe(403);
    } finally {
      await close();
    }
  });

  // ── Catalogue (RBAC stocks.read) ────────────────────────────────────────────

  it("filtre kind=RECETTE (exclut les conditionnements)", async () => {
    try {
      const res = await get(app, "/api/catalog-items?kind=RECETTE", cookieFor("brasseur"));
      expect(res.statusCode).toBe(200);
      const { items, total } = res.json();
      expect(total).toBe(3);
      expect(items.every((i: { kind: string }) => i.kind === "RECETTE")).toBe(true);
    } finally {
      await close();
    }
  });

  it("filtre category=HOP → houblon avec α en fraction dans attributes", async () => {
    try {
      const res = await get(app, "/api/catalog-items?category=HOP", cookieFor("caisse"));
      expect(res.json().items).toHaveLength(1);
      expect(res.json().items[0]).toMatchObject({
        name: "Cascade",
        attributes: { alphaAcid: 0.055 },
      });
    } finally {
      await close();
    }
  });

  it("recherche par nom", async () => {
    try {
      const res = await get(app, "/api/catalog-items?search=pilsner", cookieFor("brasseur"));
      expect(res.json().items).toHaveLength(1);
      expect(res.json().items[0].name).toBe("Malt Pilsner");
    } finally {
      await close();
    }
  });

  it("pagination : limit/offset + total conservé", async () => {
    try {
      const res = await get(app, "/api/catalog-items?limit=1&offset=1", cookieFor("brasseur"));
      const body = res.json();
      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(4);
      expect(body).toMatchObject({ limit: 1, offset: 1 });
    } finally {
      await close();
    }
  });

  it("limit > 100 → 400 (plafond)", async () => {
    try {
      const res = await get(app, "/api/catalog-items?limit=101", cookieFor("brasseur"));
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "VALIDATION" } });
    } finally {
      await close();
    }
  });

  it("catalogue : non authentifié → 401", async () => {
    try {
      expect((await get(app, "/api/catalog-items")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });

  it("catalogue : rôle sans droit sur stocks (rgpd) → 403", async () => {
    try {
      expect((await get(app, "/api/catalog-items", cookieFor("rgpd"))).statusCode).toBe(403);
    } finally {
      await close();
    }
  });
});
