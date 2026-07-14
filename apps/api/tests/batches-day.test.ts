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
  DayEventLogRecord,
  DayRepository,
  DaySessionCreateData,
  DaySessionRecord,
  DayStartContext,
  DaySyncCommit,
  DayTransitionData,
  DeviationEffect,
  DeviationRecord,
  MeasureEffect,
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

/**
 * Repo Jour J en mémoire : `start`/`applyEvent` reflètent l'atomicité DB (session
 * + statut batch + effets). Les effets sont collectés pour les assertions.
 */
class InMemoryDayRepository implements DayRepository {
  private contexts = new Map<string, DayStartContext>();
  private sessions = new Map<string, DaySessionRecord>();
  private eventLogs = new Map<string, DayEventLogRecord & { batchId: string }>();
  readonly measures: (MeasureEffect & { batchId: string })[] = [];
  readonly deviations: (DeviationEffect & { batchId: string })[] = [];

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
  applyEvent(id: string, data: DayTransitionData): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`session ${id} absente (le service garantit son existence)`);
    const batchStatus = data.finished ? "EN_FERMENTATION" : session.batchStatus;
    this.sessions.set(id, {
      batchStatus,
      phase: data.phase,
      state: data.state,
      revision: data.revision,
    });
    if (data.measure) this.measures.push({ batchId: id, ...data.measure });
    if (data.deviation) this.deviations.push({ batchId: id, ...data.deviation });
    return Promise.resolve();
  }
  findEventLogs(id: string, ids: string[]): Promise<Map<string, DayEventLogRecord>> {
    const found = new Map<string, DayEventLogRecord>();
    for (const cid of ids) {
      const log = this.eventLogs.get(cid);
      if (log && log.batchId === id) found.set(cid, log);
    }
    return Promise.resolve(found);
  }
  commitSync(id: string, commit: DaySyncCommit): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`session ${id} absente (le service garantit son existence)`);
    if (commit.changed) {
      const batchStatus = commit.finished ? "EN_FERMENTATION" : session.batchStatus;
      this.sessions.set(id, {
        batchStatus,
        phase: commit.phase,
        state: commit.state,
        revision: commit.revision,
      });
      for (const m of commit.measures) this.measures.push({ batchId: id, ...m });
      for (const d of commit.deviations) this.deviations.push({ batchId: id, ...d });
    }
    for (const e of commit.eventLogs) {
      this.eventLogs.set(e.clientEventId, {
        batchId: id,
        clientEventId: e.clientEventId,
        rejected: e.rejected,
        rejection: e.rejection,
        resultRevision: e.resultRevision,
      });
    }
    return Promise.resolve();
  }
  listDeviations(id: string): Promise<DeviationRecord[]> {
    // Reflète l'ordre d'insertion (déjà chronologique) et résout l'auteur.
    const rows = this.deviations
      .filter((d) => d.batchId === id)
      .map((d, i) => ({
        id: `dev-${i}`,
        step: d.step,
        phase: d.phase,
        reason: d.reason,
        authorName: d.authorId,
        forcedFromStatus: d.forcedFromStatus,
        occurredAt: d.occurredAt,
      }));
    return Promise.resolve(rows);
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

describe("module batches — session Jour J : appliquer un événement (M4-05)", () => {
  let app: FastifyInstance;
  let day: InMemoryDayRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    day = new InMemoryDayRepository();
    ({ app, cookieFor } = await makeApp(day));
    day.seedBatch("b1", { status: "PLANIFIE", recipeSnapshot: RECIPE_SNAPSHOT, equipment: null });
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const start = (): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", "/api/batches/b1/day/start", { cookie: cookieFor("brasseur") });
  const load = (user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "GET", "/api/batches/b1/day", { cookie: cookieFor(user) });
  const event = (payload: unknown, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", "/api/batches/b1/day/events", { cookie: cookieFor(user), payload });

  /** Fait avancer l'étape courante en la forçant (motif obligatoire). */
  const force = (at: number, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    event({ type: "FORCE_STEP", at, author: "brasseur", reason: "démo déroulé" }, user);

  it("START_STEP puis CONFIRM_STABILIZATION arment le timer de palier", async () => {
    try {
      await start();
      // init (jalon) : démarrer puis valider pour atteindre mash-1.
      await event({ type: "START_STEP", at: 1000 });
      await event({ type: "VALIDATE_STEP", at: 1000 });

      // mash-1 exige une stabilisation : START ne doit PAS armer le timer.
      const started = await event({ type: "START_STEP", at: 2000 });
      expect(started.statusCode).toBe(200);
      expect(started.json().day.state.status).toBe("AWAITING_STABILIZATION");
      expect(started.json().day.state.timer).toBeNull();

      // La stabilisation confirmée arme (enfin) le timer (feature sanctuarisée).
      const stabilized = await event({ type: "CONFIRM_STABILIZATION", at: 3000, temperatureC: 66 });
      expect(stabilized.json().day.state.status).toBe("TIMER_RUNNING");
      expect(stabilized.json().day.state.timer.stepId).toBe("mash-1");
      expect(stabilized.json().day.revision).toBe(4); // start=0 puis 4 événements
    } finally {
      await close();
    }
  });

  it("RECORD_MEASUREMENT insère un BatchMeasure (mapping density→GRAVITY, phase courante)", async () => {
    try {
      await start();
      await event({ type: "START_STEP", at: 1000 });
      await event({ type: "VALIDATE_STEP", at: 1000 }); // → mash-1 (EMPATAGE)

      const res = await event({
        type: "RECORD_MEASUREMENT",
        at: 2000,
        kind: "density",
        value: 1.048,
      });
      expect(res.statusCode).toBe(200);
      expect(day.measures).toHaveLength(1);
      expect(day.measures[0]).toMatchObject({
        type: "GRAVITY",
        value: 1.048,
        phase: "EMPATAGE",
        loggedById: "brasseur",
      });
    } finally {
      await close();
    }
  });

  it("VALIDATE_STEP avance le curseur", async () => {
    try {
      await start();
      await event({ type: "START_STEP", at: 1000 });
      const res = await event({ type: "VALIDATE_STEP", at: 1000 });
      expect(res.json().day.state.cursor).toBe(1);
      expect(res.json().day.state.completedStepIds).toEqual(["init"]);
    } finally {
      await close();
    }
  });

  it("FORCE_STEP insère un DeviationLog et avance", async () => {
    try {
      await start();
      const res = await force(1000);
      expect(res.statusCode).toBe(200);
      expect(res.json().day.state.cursor).toBe(1);
      expect(res.json().day.deviation).toMatchObject({ stepId: "init", reason: "démo déroulé" });
      expect(day.deviations).toHaveLength(1);
      expect(day.deviations[0]).toMatchObject({
        step: "init",
        phase: "INITIALISATION",
        reason: "démo déroulé",
        authorId: "brasseur",
        forcedFromStatus: "PENDING",
      });
    } finally {
      await close();
    }
  });

  it("le journal d'écart liste les forçages (étape, phase, motif, auteur) — M4-12", async () => {
    try {
      await start();
      const deviations = (user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
        inject(app, "GET", "/api/batches/b1/day/deviations", { cookie: cookieFor(user) });

      // Aucun forçage encore : journal vide.
      expect((await deviations()).json().deviations).toEqual([]);

      // Deux forçages successifs (init puis mash-1).
      await force(1000);
      await force(2000);

      const res = await deviations();
      expect(res.statusCode).toBe(200);
      const journal = res.json().deviations;
      expect(journal).toHaveLength(2);
      expect(journal[0]).toMatchObject({
        step: "init",
        phase: "INITIALISATION",
        reason: "démo déroulé",
        author: "brasseur",
        forcedFromStatus: "PENDING",
      });
      expect(typeof journal[0].occurredAt).toBe("string");
      expect(journal[1]).toMatchObject({ step: "mash-1", phase: "EMPATAGE" });

      // RBAC : la caisse lit le journal (read) ; anonyme refusé.
      expect((await deviations("caisse")).statusCode).toBe(200);
      expect((await inject(app, "GET", "/api/batches/b1/day/deviations")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });

  it("événement illégal → 409, état inchangé", async () => {
    try {
      await start();
      // VALIDATE_STEP sur une étape non démarrée est refusé par la machine.
      const res = await event({ type: "VALIDATE_STEP", at: 1000 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("DAY_EVENT_REJECTED");

      // L'état persisté n'a pas bougé (revision 0, curseur 0).
      const after = await load();
      expect(after.json().day.revision).toBe(0);
      expect(after.json().day.state.cursor).toBe(0);
    } finally {
      await close();
    }
  });

  it("dérouler jusqu'à l'ensemencement clôt le brassin en EN_FERMENTATION (TERMINE)", async () => {
    try {
      await start();
      // 6 étapes (init → … → pitching-1) forcées : la dernière clôt le Jour J.
      let last;
      for (let i = 1; i <= 6; i++) last = await force(i * 1000);
      expect(last?.statusCode).toBe(200);
      expect(last?.json().day.batchStatus).toBe("EN_FERMENTATION");
      expect(last?.json().day.phase).toBe("TERMINE");
      expect(last?.json().day.state.status).toBe("COMPLETED");

      // Un événement de plus est refusé (brassin terminé).
      expect((await force(7000)).statusCode).toBe(409);
    } finally {
      await close();
    }
  });

  it("mode en ligne : `at` absent → horodaté par le serveur", async () => {
    try {
      await start();
      const res = await event({ type: "START_STEP" }); // sans `at`
      expect(res.statusCode).toBe(200);
      expect(res.json().day.state.status).toBe("AWAITING_VALIDATION"); // init démarré
    } finally {
      await close();
    }
  });

  it("RBAC : caisse ne peut pas émettre d'événement ; anonyme refusé", async () => {
    try {
      await start();
      expect((await force(1000, "caisse")).statusCode).toBe(403);
      expect((await inject(app, "POST", "/api/batches/b1/day/events")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});

describe("module batches — session Jour J : rejeu de la file offline (M4-06)", () => {
  let app: FastifyInstance;
  let day: InMemoryDayRepository;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    day = new InMemoryDayRepository();
    ({ app, cookieFor } = await makeApp(day));
    day.seedBatch("b1", { status: "PLANIFIE", recipeSnapshot: RECIPE_SNAPSHOT, equipment: null });
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const start = (): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", "/api/batches/b1/day/start", { cookie: cookieFor("brasseur") });
  const load = (): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "GET", "/api/batches/b1/day", { cookie: cookieFor("brasseur") });
  const sync = (events: unknown, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", "/api/batches/b1/day/events:sync", {
      cookie: cookieFor(user),
      payload: { events },
    });

  const forceEvt = (clientEventId: string, at: number): unknown => ({
    clientEventId,
    event: { type: "FORCE_STEP", at, author: "brasseur", reason: "démo" },
  });

  it("applique une file de 3 événements dans l'ordre (tri par at)", async () => {
    try {
      await start();
      // Fournis dans le désordre ; le service rétablit l'ordre par `at`.
      const res = await sync([
        { clientEventId: "e2", event: { type: "VALIDATE_STEP", at: 2000 } },
        { clientEventId: "e3", ...forceEvt("e3", 3000) },
        { clientEventId: "e1", event: { type: "START_STEP", at: 1000 } },
      ]);
      expect(res.statusCode).toBe(200);
      const outcomes = res.json().day.results.map((r: { outcome: string }) => r.outcome);
      expect(outcomes).toEqual(["applied", "applied", "applied"]);
      // init démarré+validé (→ mash-1) puis mash-1 forcé (→ lauter-1).
      expect(res.json().day.state.cursor).toBe(2);
      expect(res.json().day.revision).toBe(3);
    } finally {
      await close();
    }
  });

  it("rejouer le même clientEventId n'a qu'un seul effet (idempotent)", async () => {
    try {
      await start();
      const file = [forceEvt("e1", 1000)];
      const first = await sync(file);
      expect(first.json().day.results[0].outcome).toBe("applied");
      expect(first.json().day.state.cursor).toBe(1);
      expect(day.deviations).toHaveLength(1);

      const second = await sync(file);
      expect(second.json().day.results[0].outcome).toBe("skipped");
      // Aucun double effet : curseur et écart inchangés.
      expect(second.json().day.state.cursor).toBe(1);
      expect(second.json().day.revision).toBe(1);
      expect(day.deviations).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("un rejet en milieu de file n'interrompt pas les suivants", async () => {
    try {
      await start();
      const res = await sync([
        // VALIDATE sur init non démarré → rejeté par la machine.
        { clientEventId: "e1", event: { type: "VALIDATE_STEP", at: 1000 } },
        { clientEventId: "e2", event: { type: "START_STEP", at: 2000 } },
        { clientEventId: "e3", event: { type: "VALIDATE_STEP", at: 3000 } },
      ]);
      expect(res.statusCode).toBe(200);
      const results = res.json().day.results;
      expect(results.map((r: { outcome: string }) => r.outcome)).toEqual([
        "rejected",
        "applied",
        "applied",
      ]);
      expect(results[0].rejection).toBeTruthy();
      // Seuls les 2 événements valides ont avancé (init démarré puis validé).
      expect(res.json().day.state.cursor).toBe(1);
      expect(res.json().day.revision).toBe(2);
    } finally {
      await close();
    }
  });

  it("rejouer deux fois la même file laisse le batch dans le même état (démo offline)", async () => {
    try {
      await start();
      const file = [
        forceEvt("e1", 1000),
        forceEvt("e2", 2000),
        forceEvt("e3", 3000),
        forceEvt("e4", 4000),
        forceEvt("e5", 5000),
        forceEvt("e6", 6000),
      ];
      const first = await sync(file);
      expect(first.json().day.batchStatus).toBe("EN_FERMENTATION");
      expect(first.json().day.phase).toBe("TERMINE");
      const stateAfterFirst = (await load()).json().day.state;

      // Rejeu intégral : tout est ignoré, l'état ne bouge pas.
      const second = await sync(file);
      expect(
        second.json().day.results.every((r: { outcome: string }) => r.outcome === "skipped"),
      ).toBe(true);
      const stateAfterSecond = (await load()).json().day.state;
      expect(stateAfterSecond).toEqual(stateAfterFirst);
      expect(day.deviations).toHaveLength(6); // pas de doublon
    } finally {
      await close();
    }
  });

  it("état final == application en ligne équivalente (M4-05)", async () => {
    try {
      await start();
      const events = [
        { clientEventId: "s1", event: { type: "START_STEP", at: 1000 } },
        { clientEventId: "s2", event: { type: "VALIDATE_STEP", at: 2000 } },
        { clientEventId: "s3", ...forceEvt("s3", 3000) },
      ];
      const synced = (await sync(events)).json().day;

      // Rejeu en ligne équivalent sur un second batch.
      day.seedBatch("b2", { status: "PLANIFIE", recipeSnapshot: RECIPE_SNAPSHOT, equipment: null });
      await inject(app, "POST", "/api/batches/b2/day/start", { cookie: cookieFor("brasseur") });
      const online = (u: unknown): ReturnType<FastifyInstance["inject"]> =>
        inject(app, "POST", "/api/batches/b2/day/events", {
          cookie: cookieFor("brasseur"),
          payload: u,
        });
      await online({ type: "START_STEP", at: 1000 });
      await online({ type: "VALIDATE_STEP", at: 2000 });
      const last = (
        await online({ type: "FORCE_STEP", at: 3000, author: "brasseur", reason: "démo" })
      ).json().day;

      expect(synced.state.cursor).toBe(last.state.cursor);
      expect(synced.state.completedStepIds).toEqual(last.state.completedStepIds);
      expect(synced.revision).toBe(last.revision);
    } finally {
      await close();
    }
  });

  it("404 si aucune session ; RBAC : caisse refusée, anonyme refusé", async () => {
    try {
      // Pas de session ouverte encore → 404.
      expect((await sync([forceEvt("e1", 1000)])).statusCode).toBe(404);

      await start();
      expect((await sync([forceEvt("e1", 1000)], "caisse")).statusCode).toBe(403);
      expect((await inject(app, "POST", "/api/batches/b1/day/events:sync")).statusCode).toBe(401);
    } finally {
      await close();
    }
  });
});
