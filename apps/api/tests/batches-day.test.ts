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
  DayRepository,
  DaySessionCreateData,
  DaySessionRecord,
  DayStartContext,
} from "../src/modules/batches/day.repository.js";
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

/** Repo Jour J en mémoire : `start` reflète l'atomicité DB (session + statut batch). */
class InMemoryDayRepository implements DayRepository {
  private contexts = new Map<string, DayStartContext>();
  private sessions = new Map<string, DaySessionRecord>();

  /** Amorce un batch démarrable (statut + snapshot + profil éventuel). */
  seedBatch(id: string, ctx: DayStartContext): void {
    this.contexts.set(id, ctx);
  }

  getStartContext(id: string): Promise<DayStartContext | null> {
    return Promise.resolve(this.contexts.get(id) ?? null);
  }
  getSession(id: string): Promise<DaySessionRecord | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }
  start(id: string, data: DaySessionCreateData, fromStatus: string): Promise<void> {
    const batchStatus = fromStatus === "PLANIFIE" ? "EN_BRASSAGE" : fromStatus;
    const ctx = this.contexts.get(id);
    if (ctx) this.contexts.set(id, { ...ctx, status: batchStatus as DayStartContext["status"] });
    this.sessions.set(id, {
      batchStatus: batchStatus as DaySessionRecord["batchStatus"],
      phase: data.phase,
      state: data.state,
      revision: data.revision,
    });
    return Promise.resolve();
  }
}

/** Snapshot minimal : buildDayPlan ne lit que `steps`. Brassin BEER complet. */
const RECIPE_SNAPSHOT = {
  id: "rec-1",
  name: "IPA maison",
  steps: [
    { type: "MASH_STEP", params: { tempC: 66, timeMin: 60 }, sortOrder: 0 },
    { type: "SPARGE", params: { tempC: 76 }, sortOrder: 1 },
    { type: "BOIL", params: { timeMin: 60 }, sortOrder: 2 },
    { type: "COOL", params: { targetTempC: 20 }, sortOrder: 3 },
    { type: "FERMENT", params: { days: 14 }, sortOrder: 4 },
  ],
};

const USERS: Record<string, string[]> = {
  brasseur: ["brasseur"],
  caisse: ["caisse"],
};

async function makeApp(
  day: InMemoryDayRepository,
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
  const app = await buildApp({ config, authRepository: auth, dayRepository: day });
  await app.ready();
  return { app, cookieFor: (user) => app.signCookie(`tok_${user}`) };
}

interface InjectOptions {
  cookie?: string;
}
function inject(
  app: FastifyInstance,
  method: "GET" | "POST",
  url: string,
  { cookie }: InjectOptions = {},
): ReturnType<FastifyInstance["inject"]> {
  return app.inject({
    method,
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
  });
}

describe("module batches — session Jour J : démarrer & charger (M4-04)", () => {
  let app: FastifyInstance;
  let day: InMemoryDayRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    day = new InMemoryDayRepository();
    ({ app, cookieFor } = await makeApp(day));
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const seed = (id: string, over: Partial<DayStartContext> = {}): void =>
    day.seedBatch(id, {
      status: "PLANIFIE",
      recipeSnapshot: RECIPE_SNAPSHOT,
      equipment: null,
      ...over,
    });

  const start = (id: string, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", `/api/batches/${id}/day/start`, { cookie: cookieFor(user) });
  const load = (id: string, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "GET", `/api/batches/${id}/day`, { cookie: cookieFor(user) });

  it("démarre depuis PLANIFIE : batch → EN_BRASSAGE, plan déroulable, phase INITIALISATION", async () => {
    try {
      seed("b1");
      const res = await start("b1");
      expect(res.statusCode).toBe(201);
      const { day: session } = res.json();
      expect(session.batchStatus).toBe("EN_BRASSAGE");
      expect(session.phase).toBe("INITIALISATION");
      expect(session.revision).toBe(0);
      expect(session.state.cursor).toBe(0);
      expect(session.state.status).toBe("PENDING");
      // Plan dérivé du snapshot (M4-01), jalon init en tête.
      expect(session.plan.map((s: { id: string }) => s.id)).toEqual([
        "init",
        "mash-1",
        "lauter-1",
        "boil-1",
        "cooling-1",
        "pitching-1",
      ]);
      expect(session.timings.stepId).toBe("init");
    } finally {
      await close();
    }
  });

  it("idempotent : un second start renvoie la session existante (200, non recréée)", async () => {
    try {
      seed("b1");
      const first = await start("b1");
      expect(first.statusCode).toBe(201);

      const second = await start("b1");
      expect(second.statusCode).toBe(200); // pas de re-création
      expect(second.json().day.revision).toBe(0);
      expect(second.json().day.plan).toEqual(first.json().day.plan);
      expect(second.json().day.state).toEqual(first.json().day.state);
    } finally {
      await close();
    }
  });

  it("start sur un batch déjà EN_BRASSAGE (sans session) : crée la session, statut inchangé", async () => {
    try {
      seed("b1", { status: "EN_BRASSAGE" });
      const res = await start("b1");
      expect(res.statusCode).toBe(201);
      expect(res.json().day.batchStatus).toBe("EN_BRASSAGE");
    } finally {
      await close();
    }
  });

  it("GET renvoie plan / état / timings de la session en cours", async () => {
    try {
      seed("b1");
      await start("b1");
      const res = await load("b1");
      expect(res.statusCode).toBe(200);
      const { day: session } = res.json();
      expect(session.plan).toHaveLength(6);
      expect(session.state.status).toBe("PENDING");
      expect(session.timings.stepId).toBe("init");
      expect(session.phase).toBe("INITIALISATION");
    } finally {
      await close();
    }
  });

  it("GET sans session ouverte → 404", async () => {
    try {
      seed("b1");
      const res = await load("b1");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    } finally {
      await close();
    }
  });

  it("start sur un batch inexistant → 404", async () => {
    try {
      const res = await start("absent");
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    } finally {
      await close();
    }
  });

  it("start refusé si le statut est incompatible (409)", async () => {
    try {
      seed("b1", { status: "EN_FERMENTATION" });
      const res = await start("b1");
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("DAY_NOT_STARTABLE");
    } finally {
      await close();
    }
  });

  it("RBAC : caisse lit mais ne démarre pas ; anonyme refusé", async () => {
    try {
      seed("b1");
      await start("b1"); // brasseur
      expect((await load("b1", "caisse")).statusCode).toBe(200);
      expect((await start("b1", "caisse")).statusCode).toBe(403);
      expect((await inject(app, "GET", "/api/batches/b1/day")).statusCode).toBe(401);
      expect((await inject(app, "POST", "/api/batches/b1/day/start")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});
