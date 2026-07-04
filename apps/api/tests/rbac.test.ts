import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type {
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from "../src/modules/auth/repository.js";
import { SESSION_COOKIE } from "../src/plugins/auth.js";
import type { Action, Resource, Role } from "../src/rbac/matrix.js";
import { ACTIONS, can, RESOURCES, roleCan, ROLES } from "../src/rbac/matrix.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Matrice §3.5 — restatement indépendant, testé cellule par cellule.
//    (Écrit à la main ici pour ne pas tester la matrice contre elle-même.)
// ─────────────────────────────────────────────────────────────────────────────

const C: Action[] = ["create", "read", "update", "delete"];

const EXPECTED: Record<Resource, Record<Role, Action[]>> = {
  recettes: { admin: C, brasseur: C, caisse: ["read"], rgpd: [] },
  stocks: { admin: C, brasseur: C, caisse: ["read"], rgpd: [] },
  membres: {
    admin: C,
    brasseur: [],
    caisse: [],
    rgpd: ["create", "read", "update", "delete", "export", "anonymize"],
  },
  transactions: { admin: C, brasseur: ["read"], caisse: ["read"], rgpd: [] },
  mapping: { admin: C, brasseur: ["read"], caisse: C, rgpd: [] },
  affichage: { admin: C, brasseur: ["read", "update"], caisse: ["read", "update"], rgpd: [] },
  parametres: { admin: C, brasseur: [], caisse: [], rgpd: [] },
  auditLog: { admin: ["read"], brasseur: [], caisse: [], rgpd: ["read"] },
};

describe("matrice RBAC §3.5", () => {
  it("chaque cellule (ressource × rôle × action) est conforme à la spec", () => {
    for (const resource of RESOURCES) {
      for (const role of ROLES) {
        for (const action of ACTIONS) {
          const expected = EXPECTED[resource][role].includes(action);
          expect(roleCan(role, resource, action), `${role} / ${resource} / ${action}`).toBe(
            expected,
          );
        }
      }
    }
  });

  it("rôle inconnu → tout refusé (deny-by-default)", () => {
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        expect(roleCan("ghost", resource, action)).toBe(false);
      }
    }
  });

  it("export/anonymisation membres : réservé au rôle rgpd (séparation des pouvoirs)", () => {
    expect(roleCan("rgpd", "membres", "export")).toBe(true);
    expect(roleCan("rgpd", "membres", "anonymize")).toBe(true);
    expect(roleCan("admin", "membres", "export")).toBe(false);
    expect(roleCan("admin", "membres", "anonymize")).toBe(false);
  });

  it("can() prend l'union des droits des rôles cumulés", () => {
    expect(can(["caisse", "rgpd"], "membres", "export")).toBe(true); // via rgpd
    expect(can(["brasseur", "caisse"], "recettes", "update")).toBe(true); // via brasseur
    expect(can(["caisse"], "recettes", "update")).toBe(false);
    expect(can([], "recettes", "read")).toBe(false); // aucun rôle
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Intégration Fastify — 401 / 403 / deny-by-default / exempt, par rôle.
// ─────────────────────────────────────────────────────────────────────────────

const config: AppConfig = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  SESSION_SECRET: "session-secret-at-least-16-chars",
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: "1 minute",
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Repo en mémoire : users + sessions injectés directement (pas de login). */
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

/** Users de test : un par rôle, un sans rôle, un cumulant deux rôles. */
const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
  none: [],
  multi: ["caisse", "rgpd"],
};

async function makeApp(): Promise<{ app: FastifyInstance; cookieFor: (u: string) => string }> {
  const repo = new InMemoryAuthRepository();
  const future = new Date(Date.now() + 3_600_000);
  for (const [id, roles] of Object.entries(USERS)) {
    repo.addUser({
      id,
      email: `${id}@brasso.test`,
      displayName: id,
      passwordHash: "x",
      isActive: true,
      roles,
    });
    repo.addSession({ tokenHash: sha256(`tok_${id}`), userId: id, expiresAt: future });
  }

  const app = await buildApp({ config, authRepository: repo });

  // Routes de test représentatives, déclarées via la matrice §3.5.
  await app.register(async (a) => {
    a.get("/t/recettes", { config: a.rbac("recettes", "read") }, () => ({ ok: true }));
    a.post("/t/recettes", { config: a.rbac("recettes", "create") }, () => ({ ok: true }));
    a.post("/t/membres/export", { config: a.rbac("membres", "export") }, () => ({ ok: true }));
    // Volontairement SANS déclaration → deny-by-default.
    a.get("/t/undeclared", () => ({ ok: true }));
    // Opt-out explicite.
    a.get("/t/open", { config: { rbacExempt: true } }, () => ({ ok: true }));
  });

  await app.ready();

  const cookieFor = (user: string): string => app.signCookie(`tok_${user}`);
  return { app, cookieFor };
}

function inject(
  app: FastifyInstance,
  method: "GET" | "POST",
  url: string,
  cookie?: string,
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method,
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
  });
}

describe("plugin RBAC (intégration)", () => {
  it("non authentifié → 401 (avant tout contrôle de rôle)", async () => {
    const { app } = await makeApp();
    try {
      const res = await inject(app, "GET", "/t/recettes");
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    } finally {
      await app.close();
    }
  });

  it("authentifié mais rôle non autorisé → 403", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      // rgpd n'a aucun droit sur recettes.
      const res = await inject(app, "GET", "/t/recettes", cookieFor("rgpd"));
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("rôle autorisé → 200", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      const read = await inject(app, "GET", "/t/recettes", cookieFor("caisse"));
      expect(read.statusCode).toBe(200);
      const create = await inject(app, "POST", "/t/recettes", cookieFor("brasseur"));
      expect(create.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("caisse : lecture recettes OK mais création interdite (403)", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      const read = await inject(app, "GET", "/t/recettes", cookieFor("caisse"));
      expect(read.statusCode).toBe(200);
      const create = await inject(app, "POST", "/t/recettes", cookieFor("caisse"));
      expect(create.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("export membres : rgpd OK, admin refusé (séparation des pouvoirs)", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      expect((await inject(app, "POST", "/t/membres/export", cookieFor("rgpd"))).statusCode).toBe(
        200,
      );
      expect((await inject(app, "POST", "/t/membres/export", cookieFor("admin"))).statusCode).toBe(
        403,
      );
    } finally {
      await app.close();
    }
  });

  it("rôles cumulés : union des droits", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      // multi = caisse + rgpd → lecture recettes (caisse) ET export membres (rgpd).
      expect((await inject(app, "GET", "/t/recettes", cookieFor("multi"))).statusCode).toBe(200);
      expect((await inject(app, "POST", "/t/membres/export", cookieFor("multi"))).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it("utilisateur sans rôle → 403 partout", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      expect((await inject(app, "GET", "/t/recettes", cookieFor("none"))).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("route sans déclaration → 403 même authentifié (deny-by-default)", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      expect((await inject(app, "GET", "/t/undeclared", cookieFor("admin"))).statusCode).toBe(403);
      expect((await inject(app, "GET", "/t/undeclared")).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("route rbacExempt → accessible sans session", async () => {
    const { app } = await makeApp();
    try {
      const res = await inject(app, "GET", "/t/open");
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    } finally {
      await app.close();
    }
  });

  it("les routes socle restent joignables (health public, login sans RBAC)", async () => {
    const { app } = await makeApp();
    try {
      expect((await inject(app, "GET", "/health")).statusCode).toBe(200);
      // login (rbacExempt) : atteint le handler → 400 sur payload vide, pas 403.
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: {} });
      expect(login.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("chemin inexistant → 404 (le filet deny-by-default ne s'applique qu'aux routes déclarées)", async () => {
    const { app, cookieFor } = await makeApp();
    try {
      const res = await inject(app, "GET", "/t/inconnu", cookieFor("admin"));
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });
});
