import { createHash } from "node:crypto";

import type { BatchStatus } from "@brasso/db";
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
  DayTransitionData,
} from "../src/modules/batches/day.repository.js";
import type {
  BatchDetailView,
  BatchRepository,
  ReservationView,
} from "../src/modules/batches/repository.js";
import type { RecipeRepository, RecipeWithDetails } from "../src/modules/recipes/repository.js";
import type { ConsumePort, ConsumeResult } from "../src/modules/stock/consume.js";
import {
  consumeReservationsForBatch,
  plannedVolumeFromSnapshot,
} from "../src/modules/stock/consume.js";
import type { StockRepository } from "../src/modules/stock/repository.js";
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
 * Monde de stock partagé par les trois repos en mémoire (batch/day/stock) — la
 * consommation traverse ces domaines. Fournit un `ConsumePort` en mémoire sur
 * lequel s'exécute la **vraie** fonction `consumeReservationsForBatch`.
 */
class StockWorld {
  batches = new Map<string, { status: BatchStatus; recipeSnapshot: unknown }>();
  reservations: {
    id: string;
    batchId: string;
    catalogItemId: string;
    quantity: number;
    status: string;
  }[] = [];
  movements: {
    id: string;
    catalogItemId: string;
    delta: number;
    reason: string;
    batchId: string;
  }[] = [];
  measures: { batchId: string; type: string; value: number; loggedAt: Date }[] = [];
  private seq = 0;

  seedBatch(id: string, status: BatchStatus, recipeSnapshot: unknown = {}): void {
    this.batches.set(id, { status, recipeSnapshot });
  }
  seedReservation(batchId: string, catalogItemId: string, quantity: number): void {
    this.reservations.push({
      id: `res_${++this.seq}`,
      batchId,
      catalogItemId,
      quantity,
      status: "RESERVED",
    });
  }
  seedVolumeMeasure(batchId: string, value: number): void {
    this.measures.push({
      batchId,
      type: "VOLUME",
      value,
      loggedAt: new Date(Date.now() + ++this.seq),
    });
  }
  productionFor(batchId: string): { catalogItemId: string; delta: number }[] {
    return this.movements
      .filter((m) => m.batchId === batchId && m.reason === "PRODUCTION")
      .map((m) => ({ catalogItemId: m.catalogItemId, delta: m.delta }));
  }
  reservationStatuses(batchId: string): string[] {
    return this.reservations.filter((r) => r.batchId === batchId).map((r) => r.status);
  }

  port(): ConsumePort {
    return {
      listReserved: (batchId) =>
        Promise.resolve(
          this.reservations
            .filter((r) => r.batchId === batchId && r.status === "RESERVED")
            .map((r) => ({ id: r.id, catalogItemId: r.catalogItemId, quantity: r.quantity })),
        ),
      plannedVolumeL: (batchId) =>
        Promise.resolve(plannedVolumeFromSnapshot(this.batches.get(batchId)?.recipeSnapshot)),
      latestVolumeMeasureL: (batchId) => {
        const vol = this.measures
          .filter((m) => m.batchId === batchId && m.type === "VOLUME")
          .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())[0];
        return Promise.resolve(vol?.value ?? null);
      },
      createProductionMovement: ({ catalogItemId, delta, batchId }) => {
        const id = `mv_${++this.seq}`;
        this.movements.push({ id, catalogItemId, delta, reason: "PRODUCTION", batchId });
        return Promise.resolve(id);
      },
      markConsumed: (reservationId) => {
        const r = this.reservations.find((x) => x.id === reservationId);
        if (r) r.status = "CONSUMED";
        return Promise.resolve();
      },
    };
  }
}

/** Repo stock en mémoire : seules la garde de statut et la consommation servent ici. */
class InMemoryStockRepo implements StockRepository {
  constructor(private readonly world: StockWorld) {}
  getBatchStatus(batchId: string): Promise<BatchStatus | null> {
    return Promise.resolve(this.world.batches.get(batchId)?.status ?? null);
  }
  consumeForBatch(batchId: string, actorId: string | null): Promise<ConsumeResult> {
    return consumeReservationsForBatch(this.world.port(), batchId, actorId);
  }
  listItems(): never {
    throw new Error("non sollicité");
  }
  findItemDetail(): never {
    throw new Error("non sollicité");
  }
  findItemById(): never {
    throw new Error("non sollicité");
  }
  createItem(): never {
    throw new Error("non sollicité");
  }
  updateItem(): never {
    throw new Error("non sollicité");
  }
  createLot(): never {
    throw new Error("non sollicité");
  }
  createMovement(): never {
    throw new Error("non sollicité");
  }
  listMovements(): never {
    throw new Error("non sollicité");
  }
  applyInventory(): never {
    throw new Error("non sollicité");
  }
}

/** Repo batch en mémoire : `transition` consomme à l'entrée en EN_FERMENTATION. */
class InMemoryBatchRepo implements BatchRepository {
  constructor(private readonly world: StockWorld) {}

  private detail(id: string): BatchDetailView {
    const b = this.world.batches.get(id);
    if (!b) throw new Error(`batch ${id} absent`);
    const reservations: ReservationView[] = this.world.reservations
      .filter((r) => r.batchId === id)
      .map((r) => ({
        id: r.id,
        catalogItemId: r.catalogItemId,
        quantity: r.quantity,
        status: r.status as ReservationView["status"],
      }));
    const now = new Date();
    return {
      id,
      batchNumber: 1,
      recipeId: "rec-1",
      recipeVersion: 1,
      equipmentProfileId: null,
      status: b.status,
      plannedAt: null,
      brewedAt: null,
      fermentedAt: null,
      packagedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      recipeSnapshot: b.recipeSnapshot,
      reservations,
    };
  }

  findById(id: string): Promise<BatchDetailView | null> {
    return Promise.resolve(this.world.batches.has(id) ? this.detail(id) : null);
  }
  async transition(
    id: string,
    status: BatchStatus,
    actorId: string | null = null,
  ): Promise<BatchDetailView> {
    const b = this.world.batches.get(id);
    if (!b) throw new Error(`batch ${id} absent`);
    b.status = status;
    if (status === "EN_FERMENTATION") {
      await consumeReservationsForBatch(this.world.port(), id, actorId);
    }
    return this.detail(id);
  }
  cancel(id: string): Promise<BatchDetailView> {
    const b = this.world.batches.get(id);
    if (!b) throw new Error(`batch ${id} absent`);
    b.status = "ANNULE";
    for (const r of this.world.reservations) {
      if (r.batchId === id && r.status === "RESERVED") r.status = "RELEASED";
    }
    return Promise.resolve(this.detail(id));
  }
  list(): never {
    throw new Error("non sollicité");
  }
  create(): never {
    throw new Error("non sollicité");
  }
  availableByItem(): never {
    throw new Error("non sollicité");
  }
  addMeasure(): never {
    throw new Error("non sollicité");
  }
  listMeasures(): never {
    throw new Error("non sollicité");
  }
}

/** Repo Jour J en mémoire : `applyEvent` consomme quand le brassin est terminé. */
class InMemoryDayRepo implements DayRepository {
  private sessions = new Map<string, DaySessionRecord>();
  constructor(private readonly world: StockWorld) {}

  getStartContext(batchId: string): Promise<DayStartContext | null> {
    const b = this.world.batches.get(batchId);
    if (!b) return Promise.resolve(null);
    return Promise.resolve({ status: b.status, recipeSnapshot: b.recipeSnapshot, equipment: null });
  }
  getSession(batchId: string): Promise<DaySessionRecord | null> {
    return Promise.resolve(this.sessions.get(batchId) ?? null);
  }
  start(batchId: string, data: DaySessionCreateData, fromStatus: BatchStatus): Promise<void> {
    const b = this.world.batches.get(batchId);
    const batchStatus: BatchStatus = fromStatus === "PLANIFIE" ? "EN_BRASSAGE" : fromStatus;
    if (b) b.status = batchStatus;
    this.sessions.set(batchId, {
      batchStatus,
      phase: data.phase,
      state: data.state,
      revision: data.revision,
    });
    return Promise.resolve();
  }
  async applyEvent(batchId: string, data: DayTransitionData): Promise<void> {
    const session = this.sessions.get(batchId);
    if (!session) throw new Error(`session ${batchId} absente`);
    const batchStatus: BatchStatus = data.finished ? "EN_FERMENTATION" : session.batchStatus;
    this.sessions.set(batchId, {
      batchStatus,
      phase: data.phase,
      state: data.state,
      revision: data.revision,
    });
    if (data.finished) {
      const b = this.world.batches.get(batchId);
      if (b) b.status = "EN_FERMENTATION";
      await consumeReservationsForBatch(this.world.port(), batchId, data.actorId);
    }
  }
  findEventLogs(): never {
    throw new Error("non sollicité");
  }
  commitSync(): never {
    throw new Error("non sollicité");
  }
  listDeviations(): never {
    throw new Error("non sollicité");
  }
  getCorrectionContext(): never {
    throw new Error("non sollicité");
  }
  logCorrection(): never {
    throw new Error("non sollicité");
  }
}

class StubRecipeRepository implements RecipeRepository {
  findById(): Promise<RecipeWithDetails | null> {
    return Promise.resolve(null);
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

/** Snapshot BEER : `steps` pour buildDayPlan + `batchVolumeL` pour l'ajustement. */
const SNAPSHOT = {
  id: "rec-1",
  name: "IPA maison",
  engine: "BEER",
  beerDetails: { batchVolumeL: 20 },
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

async function makeApp(): Promise<{
  app: FastifyInstance;
  world: StockWorld;
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
  const world = new StockWorld();
  const app = await buildApp({
    config,
    authRepository: auth,
    batchRepository: new InMemoryBatchRepo(world),
    dayRepository: new InMemoryDayRepo(world),
    stockRepository: new InMemoryStockRepo(world),
    recipeRepository: new StubRecipeRepository(),
  });
  await app.ready();
  return { app, world, cookieFor: (user) => app.signCookie(`tok_${user}`) };
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

describe("déduction de stock à l'ensemencement (M5-05)", () => {
  let app: FastifyInstance;
  let world: StockWorld;
  let cookieFor: (u: string) => string;

  beforeEach(async () => {
    ({ app, world, cookieFor } = await makeApp());
  });
  const close = async (): Promise<void> => {
    await app.close();
  };

  const consume = (id: string, user = "brasseur"): ReturnType<FastifyInstance["inject"]> =>
    inject(app, "POST", `/api/batches/${id}/stock/consume`, { cookie: cookieFor(user) });

  it("endpoint : consomme les réservations en mouvements PRODUCTION et passe à CONSUMED", async () => {
    try {
      world.seedBatch("b1", "EN_FERMENTATION", SNAPSHOT);
      world.seedReservation("b1", "malt", 5000);
      world.seedReservation("b1", "houblon", 200);

      const res = await consume("b1");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ consumed: 2, alreadyDone: false });
      expect(body.movements).toHaveLength(2);

      // Sans mesure VOLUME → pas d'ajustement : deltas = −quantités planifiées.
      expect(world.productionFor("b1")).toEqual([
        { catalogItemId: "malt", delta: -5000 },
        { catalogItemId: "houblon", delta: -200 },
      ]);
      expect(world.reservationStatuses("b1")).toEqual(["CONSUMED", "CONSUMED"]);
    } finally {
      await close();
    }
  });

  it("ajuste au volume réel : mesure VOLUME < planifié → quantités réduites", async () => {
    try {
      // Planifié 20 L, mesuré 15 L → facteur 0,75 : 4000 g → 3000 g.
      world.seedBatch("b2", "EN_FERMENTATION", SNAPSHOT);
      world.seedReservation("b2", "malt", 4000);
      world.seedVolumeMeasure("b2", 15);

      const res = await consume("b2");
      expect(res.statusCode).toBe(200);
      expect(world.productionFor("b2")).toEqual([{ catalogItemId: "malt", delta: -3000 }]);
    } finally {
      await close();
    }
  });

  it("idempotent : un 2ᵉ appel est un no-op (pas de double décrément)", async () => {
    try {
      world.seedBatch("b3", "EN_FERMENTATION", SNAPSHOT);
      world.seedReservation("b3", "malt", 5000);

      const first = await consume("b3");
      expect(first.json()).toMatchObject({ consumed: 1, alreadyDone: false });

      const second = await consume("b3");
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ consumed: 0, alreadyDone: true });
      expect(second.json().movements).toHaveLength(0);

      // Un seul mouvement au total.
      expect(world.productionFor("b3")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("409 si le batch n'est pas encore ensemencé ; 404 si absent", async () => {
    try {
      world.seedBatch("b4", "PLANIFIE", SNAPSHOT);
      world.seedReservation("b4", "malt", 5000);

      const early = await consume("b4");
      expect(early.statusCode).toBe(409);
      expect(early.json().error.code).toBe("BATCH_NOT_SEEDED");
      // Aucune consommation.
      expect(world.productionFor("b4")).toHaveLength(0);
      expect(world.reservationStatuses("b4")).toEqual(["RESERVED"]);

      const missing = await consume("nope");
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe("BATCH_NOT_FOUND");
    } finally {
      await close();
    }
  });

  it("RBAC : caisse 403, anonyme 401", async () => {
    try {
      world.seedBatch("b5", "EN_FERMENTATION", SNAPSHOT);
      world.seedReservation("b5", "malt", 5000);

      expect((await consume("b5", "caisse")).statusCode).toBe(403);
      expect((await inject(app, "POST", "/api/batches/b5/stock/consume")).statusCode).toBe(401);
      // Refus RBAC → rien consommé.
      expect(world.productionFor("b5")).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("via changeStatus : entrer en EN_FERMENTATION consomme, puis rappel idempotent", async () => {
    try {
      world.seedBatch("b6", "EN_BRASSAGE", SNAPSHOT);
      world.seedReservation("b6", "malt", 5000);

      const res = await inject(app, "POST", "/api/batches/b6/status", {
        cookie: cookieFor("brasseur"),
        payload: { status: "EN_FERMENTATION" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().batch.status).toBe("EN_FERMENTATION");
      // La transition a consommé la réservation.
      expect(res.json().batch.reservations[0].status).toBe("CONSUMED");
      expect(world.productionFor("b6")).toEqual([{ catalogItemId: "malt", delta: -5000 }]);

      // Rappel via l'endpoint dédié : idempotent (double chemin).
      const again = await consume("b6");
      expect(again.json()).toMatchObject({ consumed: 0, alreadyDone: true });
      expect(world.productionFor("b6")).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it("via clôture Jour J : dérouler jusqu'à l'ensemencement consomme le stock", async () => {
    try {
      world.seedBatch("bd", "PLANIFIE", SNAPSHOT);
      world.seedReservation("bd", "malt", 5000);

      const start = await inject(app, "POST", "/api/batches/bd/day/start", {
        cookie: cookieFor("brasseur"),
      });
      expect(start.statusCode).toBe(201);

      // 6 FORCE_STEP (init → … → pitching) : le dernier clôt le Jour J.
      let last;
      for (let i = 1; i <= 6; i++) {
        last = await inject(app, "POST", "/api/batches/bd/day/events", {
          cookie: cookieFor("brasseur"),
          payload: { type: "FORCE_STEP", at: i * 1000, author: "brasseur", reason: "démo" },
        });
      }
      expect(last?.statusCode).toBe(200);
      expect(last?.json().day.batchStatus).toBe("EN_FERMENTATION");

      // La clôture a consommé la réservation dans sa transaction.
      expect(world.productionFor("bd")).toEqual([{ catalogItemId: "malt", delta: -5000 }]);
      expect(world.reservationStatuses("bd")).toEqual(["CONSUMED"]);
    } finally {
      await close();
    }
  });
});
