import { createHash } from "node:crypto";

import type { BatchStatus, MeasureType } from "@brasso/core";
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
  BatchCycleRepository,
  BatchVolumeInputs,
  CycleDefaults,
  MilestoneActualPatch,
  MilestoneView,
  MilestoneWriteData,
} from "../src/modules/batches/cycle.repository.js";
import type {
  BatchCostInputs,
  BatchCreateData,
  BatchDetailView,
  BatchListFilters,
  BatchRepository,
  BatchSummaryView,
  MeasureCreateData,
  MeasureView,
  ReservationInput,
} from "../src/modules/batches/repository.js";
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

/** Repo de batchs minimal : seuls `findById` et `transition` servent ici. */
class StubBatchRepository implements BatchRepository {
  private store = new Map<string, BatchDetailView>();

  seed(batch: BatchDetailView): void {
    this.store.set(batch.id, batch);
  }
  findById(id: string): Promise<BatchDetailView | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  transition(id: string, status: BatchStatus): Promise<BatchDetailView> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`batch ${id} absent`);
    const now = new Date();
    const stamp =
      status === "EN_BRASSAGE"
        ? { brewedAt: now }
        : status === "EN_FERMENTATION"
          ? { fermentedAt: now }
          : status === "EN_CONDITIONNEMENT"
            ? { packagedAt: now }
            : status === "TERMINE"
              ? { completedAt: now }
              : {};
    const updated = { ...existing, status, ...stamp, updatedAt: now };
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }
  cancel(id: string): Promise<BatchDetailView> {
    const existing = this.store.get(id);
    if (!existing) throw new Error(`batch ${id} absent`);
    const updated: BatchDetailView = { ...existing, status: "ANNULE", updatedAt: new Date() };
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }
  list(_filters: BatchListFilters): Promise<BatchSummaryView[]> {
    return Promise.resolve([]);
  }
  create(
    _data: BatchCreateData,
    _reservations: ReservationInput[],
    _createdById: string | null,
  ): Promise<BatchDetailView> {
    throw new Error("non sollicité");
  }
  availableByItem(): Promise<Map<string, number>> {
    return Promise.resolve(new Map());
  }
  addMeasure(
    _batchId: string,
    _data: MeasureCreateData,
    _loggedById: string | null,
  ): Promise<MeasureView> {
    throw new Error("non sollicité");
  }
  listMeasures(_batchId: string, _type?: MeasureType): Promise<MeasureView[]> {
    return Promise.resolve([]);
  }
  getCostInputs(_id: string): Promise<BatchCostInputs | null> {
    return Promise.resolve(null);
  }
}

/** Repository de cycle en mémoire — reproduit l'upsert + purge du Prisma. */
class InMemoryCycleRepository implements BatchCycleRepository {
  private milestones = new Map<string, MilestoneView[]>();
  private volumeInputs = new Map<string, BatchVolumeInputs>();
  private defaults: CycleDefaults = {
    timezone: "Europe/Paris",
    fermentationDays: 14,
    dryHopDays: 3,
    coldCrashDays: 2,
    gardeDays: 21,
  };
  private seq = 0;

  setDefaults(patch: Partial<CycleDefaults>): void {
    this.defaults = { ...this.defaults, ...patch };
  }
  seedVolumeInputs(batchId: string, inputs: BatchVolumeInputs): void {
    this.volumeInputs.set(batchId, inputs);
  }
  /** Marque un jalon comme achevé (dates réelles), sans passer par l'API. */
  complete(batchId: string, kind: string, actualEndAt: Date): void {
    const list = this.milestones.get(batchId) ?? [];
    this.milestones.set(
      batchId,
      list.map((m) => (m.kind === kind ? { ...m, actualEndAt } : m)),
    );
  }

  cycleDefaults(): Promise<CycleDefaults> {
    return Promise.resolve(this.defaults);
  }
  listMilestones(batchId: string): Promise<MilestoneView[]> {
    const list = [...(this.milestones.get(batchId) ?? [])];
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.resolve(list);
  }
  saveMilestones(batchId: string, data: MilestoneWriteData[]): Promise<MilestoneView[]> {
    const existing = this.milestones.get(batchId) ?? [];
    const next = data.map((m) => {
      const previous = existing.find((e) => e.kind === m.kind);
      return {
        id: previous?.id ?? `ms_${++this.seq}`,
        ...m,
        // Les dates réelles survivent à une replanification.
        actualStartAt: previous?.actualStartAt ?? null,
        actualEndAt: previous?.actualEndAt ?? null,
      };
    });
    this.milestones.set(batchId, next);
    return this.listMilestones(batchId);
  }
  updateMilestoneActuals(
    batchId: string,
    kind: string,
    patch: MilestoneActualPatch,
  ): Promise<MilestoneView | null> {
    const list = this.milestones.get(batchId) ?? [];
    const found = list.find((m) => m.kind === kind);
    if (!found) return Promise.resolve(null);
    const updated: MilestoneView = {
      ...found,
      ...(patch.actualStartAt !== undefined ? { actualStartAt: patch.actualStartAt } : {}),
      ...(patch.actualEndAt !== undefined ? { actualEndAt: patch.actualEndAt } : {}),
    };
    this.milestones.set(
      batchId,
      list.map((m) => (m.kind === kind ? updated : m)),
    );
    return Promise.resolve(updated);
  }
  getVolumeInputs(batchId: string): Promise<BatchVolumeInputs | null> {
    return Promise.resolve(this.volumeInputs.get(batchId) ?? null);
  }
}

function batchFixture(over: Partial<BatchDetailView> = {}): BatchDetailView {
  const now = new Date("2026-03-01T08:00:00Z");
  return {
    id: "batch_1",
    batchNumber: 1,
    recipeId: "rec-1",
    recipeVersion: 1,
    equipmentProfileId: null,
    status: "EN_BRASSAGE",
    plannedAt: null,
    brewedAt: now,
    fermentedAt: null,
    packagedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    recipeSnapshot: { id: "rec-1", steps: [], ingredients: [] },
    reservations: [],
    ...over,
  };
}

/** Snapshot d'une recette portant un dry hop (houblon `use = DRY_HOP`). */
const snapshotWithDryHop = {
  id: "rec-1",
  steps: [],
  ingredients: [{ category: "HOP", name: "Citra", amount: 60, use: "DRY_HOP" }],
};

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

async function makeApp(
  batches: StubBatchRepository,
  cycle: InMemoryCycleRepository,
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
    batchRepository: batches,
    cycleRepository: cycle,
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

let app: FastifyInstance;
let cookieFor: (user: string) => string;
let batches: StubBatchRepository;
let cycle: InMemoryCycleRepository;

beforeEach(async () => {
  batches = new StubBatchRepository();
  cycle = new InMemoryCycleRepository();
  batches.seed(batchFixture());
  ({ app, cookieFor } = await makeApp(batches, cycle));
});

/** Raccourci : crée la séquence de jalons du brassin de test. */
const createMilestones = (payload: unknown = {}, batchId = "batch_1") =>
  inject(app, "POST", `/api/batches/${batchId}/milestones`, {
    cookie: cookieFor("brasseur"),
    payload,
  });

/**
 * Dates de fin **calendaires** par jalon. On lit `plannedEndDate` et non
 * `plannedEndAt` : minuit à Paris se sérialise `…T23:00:00Z` la veille, donc
 * tronquer l'instant ISO afficherait systématiquement le jour d'avant.
 */
const datesOf = (body: { milestones: { kind: string; plannedEndDate: string }[] }) =>
  Object.fromEntries(body.milestones.map((m) => [m.kind, m.plannedEndDate]));

describe("POST /api/batches/:id/milestones — création de la séquence (M9-07)", () => {
  it("crée les jalons aux dates calculées par core (FORMULES §13.1)", async () => {
    batches.seed(batchFixture({ recipeSnapshot: snapshotWithDryHop }));
    // Ensemencement le 2026-03-01, durées par défaut 14/3/2/21.
    const res = await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { created: boolean; milestones: { kind: string }[] };
    expect(body.created).toBe(true);
    expect(body.milestones.map((m) => m.kind)).toEqual([
      "FERMENTATION",
      "DRY_HOP",
      "COLD_CRASH",
      "GARDE",
    ]);
    expect(datesOf(res.json())).toEqual({
      FERMENTATION: "2026-03-15",
      DRY_HOP: "2026-03-18",
      COLD_CRASH: "2026-03-20",
      GARDE: "2026-04-10",
    });
  });

  it("sans dry hop dans la recette, la phase est absente et la séquence se referme", async () => {
    const res = await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
    expect(res.json().milestones.map((m: { kind: string }) => m.kind)).toEqual([
      "FERMENTATION",
      "COLD_CRASH",
      "GARDE",
    ]);
    expect(datesOf(res.json()).GARDE).toBe("2026-04-07");
  });

  it("les durées de la requête priment sur celles des Settings", async () => {
    cycle.setDefaults({ gardeDays: 21 });
    const res = await createMilestones({
      pitchedAt: "2026-03-01T00:00:00+01:00",
      fermentationDays: 7,
      gardeDays: 30,
    });
    const byKind = Object.fromEntries(
      res
        .json()
        .milestones.map((m: { kind: string; plannedDurationDays: number }) => [
          m.kind,
          m.plannedDurationDays,
        ]),
    );
    expect(byKind).toMatchObject({ FERMENTATION: 7, COLD_CRASH: 2, GARDE: 30 });
  });

  it("une durée nulle supprime la phase de la séquence", async () => {
    const res = await createMilestones({
      pitchedAt: "2026-03-01T00:00:00+01:00",
      coldCrashDays: 0,
    });
    expect(res.json().milestones.map((m: { kind: string }) => m.kind)).toEqual([
      "FERMENTATION",
      "GARDE",
    ]);
  });

  it("refuse une durée hors bornes plutôt que de l'écrêter", async () => {
    expect((await createMilestones({ gardeDays: 366 })).statusCode).toBe(400);
    expect((await createMilestones({ gardeDays: -1 })).statusCode).toBe(400);
    expect((await createMilestones({ gardeDays: 21.5 })).statusCode).toBe(400);
  });

  it("brassin inexistant → 404", async () => {
    const res = await createMilestones({}, "inconnu");
    expect(res.statusCode).toBe(404);
  });

  describe("idempotence (rejeu de la file offline, ADR-08)", () => {
    it("rejouer la validation d'ensemencement ne crée pas de doublon", async () => {
      const first = await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
      expect(first.statusCode).toBe(201);

      // Même action rejouée à la reconnexion : réponse propre, pas une erreur.
      const replay = await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().created).toBe(false);

      const list = await inject(app, "GET", "/api/batches/batch_1/milestones", {
        cookie: cookieFor("brasseur"),
      });
      expect(list.json().milestones).toHaveLength(3);
      // Les dates de la première création font foi : le rejeu ne replanifie rien.
      expect(datesOf(list.json())).toEqual(datesOf(first.json()));
    });

    it("un rejeu avec d'autres durées ne réécrit pas la séquence existante", async () => {
      const first = await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
      const replay = await createMilestones({
        pitchedAt: "2026-03-01T00:00:00+01:00",
        gardeDays: 60,
      });
      expect(replay.json().created).toBe(false);
      expect(datesOf(replay.json())).toEqual(datesOf(first.json()));
    });
  });
});

describe("GET /api/batches/:id/milestones", () => {
  it("restitue les jalons avec dates prévues et réelles", async () => {
    await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
    const res = await inject(app, "GET", "/api/batches/batch_1/milestones", {
      cookie: cookieFor("caisse"),
    });
    expect(res.statusCode).toBe(200);
    const first = res.json().milestones[0];
    expect(first).toMatchObject({
      kind: "FERMENTATION",
      completed: false,
      actualEndAt: null,
      actualEndDate: null,
      plannedStartDate: "2026-03-01",
      plannedEndDate: "2026-03-15",
    });
  });

  it("expose la date calendaire à côté de l'instant : tronquer l'ISO donnerait la veille", async () => {
    await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
    const res = await inject(app, "GET", "/api/batches/batch_1/milestones", {
      cookie: cookieFor("brasseur"),
    });
    const garde = res.json().milestones.find((m: { kind: string }) => m.kind === "GARDE");

    // Fin de garde le 7 avril à minuit, heure de Paris (UTC+2 à cette date).
    expect(garde.plannedEndDate).toBe("2026-04-07");
    expect(garde.plannedEndAt).toBe("2026-04-06T22:00:00.000Z");
    // C'est bien le piège : l'instant tronqué désigne un autre jour.
    expect(garde.plannedEndAt.slice(0, 10)).not.toBe(garde.plannedEndDate);
  });

  it("brassin inexistant → 404", async () => {
    const res = await inject(app, "GET", "/api/batches/inconnu/milestones", {
      cookie: cookieFor("brasseur"),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/batches/:id/milestones/:kind — ajustement", () => {
  const patch = (kind: string, payload: unknown) =>
    inject(app, "PATCH", `/api/batches/batch_1/milestones/${kind}`, {
      cookie: cookieFor("brasseur"),
      payload,
    });

  beforeEach(async () => {
    await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
  });

  it("changer une durée recalcule les jalons suivants en cascade", async () => {
    // Fermentation 14 → 21 j : tout glisse de 7 jours.
    const res = await patch("FERMENTATION", { plannedDurationDays: 21 });
    expect(res.statusCode).toBe(200);
    expect(datesOf(res.json())).toEqual({
      FERMENTATION: "2026-03-22",
      COLD_CRASH: "2026-03-24",
      GARDE: "2026-04-14",
    });
  });

  it("ramener une durée à 0 supprime la phase, sans trou dans la suite", async () => {
    const res = await patch("COLD_CRASH", { plannedDurationDays: 0 });
    expect(res.json().milestones.map((m: { kind: string }) => m.kind)).toEqual([
      "FERMENTATION",
      "GARDE",
    ]);
    expect(datesOf(res.json()).GARDE).toBe("2026-04-05");
  });

  it("renseigne les dates réelles d'un jalon", async () => {
    const res = await patch("FERMENTATION", {
      actualStartAt: "2026-03-01T09:00:00Z",
      actualEndAt: "2026-03-16T09:00:00Z",
    });
    const fermentation = res
      .json()
      .milestones.find((m: { kind: string }) => m.kind === "FERMENTATION");
    expect(fermentation.completed).toBe(true);
    expect(fermentation.actualEndAt).toBe("2026-03-16T09:00:00.000Z");
  });

  describe("un jalon achevé n'est pas révisable", () => {
    it("changer sa durée est refusé (409)", async () => {
      cycle.complete("batch_1", "FERMENTATION", new Date("2026-03-16T09:00:00Z"));
      const res = await patch("FERMENTATION", { plannedDurationDays: 21 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error?.code ?? res.json().code).toBe("MILESTONE_COMPLETED");
    });

    it("la cascade reprend à sa fin constatée, sans le réécrire", async () => {
      // Fermentation achevée le 16/03 (un jour de plus que prévu).
      cycle.complete("batch_1", "FERMENTATION", new Date("2026-03-16T00:00:00+01:00"));
      const res = await patch("COLD_CRASH", { plannedDurationDays: 3 });

      const byKind = datesOf(res.json());
      // La fermentation garde sa prévision d'origine…
      expect(byKind.FERMENTATION).toBe("2026-03-15");
      // …et la suite repart du 16/03 constaté : +3 j puis +21 j.
      expect(byKind.COLD_CRASH).toBe("2026-03-19");
      expect(byKind.GARDE).toBe("2026-04-09");
    });
  });

  it("jalon absent de la séquence → 404", async () => {
    const res = await patch("DRY_HOP", { plannedDurationDays: 3 });
    expect(res.statusCode).toBe(404);
  });

  it("kind inconnu ou corps vide → 400", async () => {
    expect((await patch("SIESTE", { plannedDurationDays: 3 })).statusCode).toBe(400);
    expect((await patch("GARDE", {})).statusCode).toBe(400);
  });
});

describe("GET /api/batches/:id/volumes — synthèse (M9-06 exposée)", () => {
  const seedVolumes = (over: Partial<BatchVolumeInputs> = {}): void => {
    cycle.seedVolumeInputs("batch_1", {
      boilTimeMin: 60,
      equipment: { deadspaceL: 1, transferLossL: 0.5, evaporationRateLPerHour: 3 },
      volumeMeasures: [],
      packaging: [],
      ...over,
    });
  };
  const get = () =>
    inject(app, "GET", "/api/batches/batch_1/volumes", { cookie: cookieFor("brasseur") });

  it("restitue la chaîne, en distinguant mesuré et estimé", async () => {
    seedVolumes({ volumeMeasures: [{ phase: "FILTRATION", value: 30 }] });
    const { volumes } = (await get()).json();

    expect(volumes.preBoil).toEqual({ volumeL: 30, source: "measured" });
    expect(volumes.postBoil).toEqual({ volumeL: 27, source: "estimated" });
    expect(volumes.transferred).toEqual({ volumeL: 25.5, source: "estimated" });
    expect(volumes.evaporationL).toBe(3);
  });

  it("aiguille chaque mesure vers son maillon selon la phase Jour J", async () => {
    seedVolumes({
      volumeMeasures: [
        { phase: "FILTRATION", value: 30 },
        { phase: "EBULLITION", value: 26 },
        { phase: "ENSEMENCEMENT", value: 24.5 },
      ],
    });
    const { volumes } = (await get()).json();
    expect(volumes.postBoil).toEqual({ volumeL: 26, source: "measured" });
    expect(volumes.pitched).toEqual({ volumeL: 24.5, source: "measured" });
  });

  it("une reprise de mesure sur la même phase corrige la précédente", async () => {
    seedVolumes({
      volumeMeasures: [
        { phase: "FILTRATION", value: 28 },
        { phase: "FILTRATION", value: 30 },
      ],
    });
    expect((await get()).json().volumes.preBoil.volumeL).toBe(30);
  });

  it("le rendement de conditionnement vient des contenants saisis", async () => {
    seedVolumes({
      volumeMeasures: [{ phase: "FILTRATION", value: 30 }],
      packaging: [
        { containerVolumeL: 20, quantity: 1 },
        { containerVolumeL: 0.5, quantity: 8 },
      ],
    });
    const { volumes } = (await get()).json();
    expect(volumes.packaged).toEqual({ volumeL: 24, source: "measured" });
    expect(volumes.packagingYieldPercent).toBe(80);
    expect(volumes.warnings).toEqual([]);
  });

  it("un rendement > 100 % est retourné avec un avertissement, jamais masqué", async () => {
    seedVolumes({
      volumeMeasures: [{ phase: "FILTRATION", value: 20 }],
      packaging: [{ containerVolumeL: 24, quantity: 1 }],
    });
    const { volumes } = (await get()).json();
    expect(volumes.packagingYieldPercent).toBe(120);
    expect(volumes.warnings[0]).toMatch(/physiquement impossible/i);
  });

  it("sans conditionnement, le rendement reste null (et non 0 %)", async () => {
    seedVolumes({ volumeMeasures: [{ phase: "FILTRATION", value: 30 }] });
    expect((await get()).json().volumes.packagingYieldPercent).toBeNull();
  });

  it("sans profil d'équipement, la chaîne reste exploitable", async () => {
    seedVolumes({ equipment: null, volumeMeasures: [{ phase: "FILTRATION", value: 30 }] });
    const { volumes } = (await get()).json();
    expect(volumes.preBoil.volumeL).toBe(30);
    expect(volumes.evaporationL).toBeNull();
    expect(volumes.postBoil.source).toBe("unknown");
  });

  it("brassin inexistant → 404", async () => {
    const res = await inject(app, "GET", "/api/batches/inconnu/volumes", {
      cookie: cookieFor("brasseur"),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("transitions de statut jusqu'à TERMINE (M9-07 §C)", () => {
  const setStatus = (status: string, user = "brasseur", batchId = "batch_1") =>
    inject(app, "POST", `/api/batches/${batchId}/status`, {
      cookie: cookieFor(user),
      payload: { status },
    });

  it("mène un brassin de EN_BRASSAGE à TERMINE et horodate chaque jalon", async () => {
    const fermentation = await setStatus("EN_FERMENTATION");
    expect(fermentation.statusCode).toBe(200);
    expect(fermentation.json().batch.fermentedAt).not.toBeNull();

    const conditioning = await setStatus("EN_CONDITIONNEMENT");
    expect(conditioning.json().batch.packagedAt).not.toBeNull();

    const done = await setStatus("TERMINE");
    expect(done.json().batch.status).toBe("TERMINE");
    expect(done.json().batch.completedAt).not.toBeNull();
  });

  it("refuse un saut d'étape et un retour en arrière", async () => {
    expect((await setStatus("TERMINE")).statusCode).toBe(409);
    await setStatus("EN_FERMENTATION");
    expect((await setStatus("EN_BRASSAGE")).statusCode).toBe(409);
  });

  describe("rejeu de la file offline (ADR-08) : idempotent, sans effet rejoué", () => {
    it("redemander le statut courant réussit sans rien réappliquer", async () => {
      const first = await setStatus("EN_FERMENTATION");
      expect(first.json().changed).toBe(true);
      const fermentedAt = first.json().batch.fermentedAt;

      const replay = await setStatus("EN_FERMENTATION");
      expect(replay.statusCode).toBe(200);
      expect(replay.json().changed).toBe(false);
      // L'horodatage du jalon n'est pas réécrit : c'est bien un constat, pas
      // une seconde application (et les réservations ne sont pas reconsommées).
      expect(replay.json().batch.fermentedAt).toBe(fermentedAt);
    });

    it("le rejeu n'ouvre pas la voie à un saut : la suite reste contrôlée", async () => {
      await setStatus("EN_FERMENTATION");
      await setStatus("EN_FERMENTATION");
      // Toujours impossible de sauter le conditionnement.
      expect((await setStatus("TERMINE")).statusCode).toBe(409);
    });
  });

  it("un brassin ANNULE ne repart jamais", async () => {
    batches.seed(batchFixture({ id: "batch_2", status: "ANNULE" }));
    for (const target of ["EN_FERMENTATION", "EN_CONDITIONNEMENT", "TERMINE"]) {
      expect((await setStatus(target, "brasseur", "batch_2")).statusCode).toBe(409);
    }
    // Le redemander annulé est un constat, pas une relance : accepté sans effet.
    const replay = await setStatus("ANNULE", "brasseur", "batch_2");
    expect(replay.statusCode).toBe(200);
    expect(replay.json().changed).toBe(false);
    expect(replay.json().batch.status).toBe("ANNULE");
  });
});

describe("RBAC des routes de cycle (deny-by-default, ADR-10)", () => {
  beforeEach(async () => {
    await createMilestones({ pitchedAt: "2026-03-01T00:00:00+01:00" });
    cycle.seedVolumeInputs("batch_1", {
      boilTimeMin: 60,
      equipment: null,
      volumeMeasures: [],
      packaging: [],
    });
  });

  const routes = [
    { method: "GET" as const, url: "/api/batches/batch_1/milestones", write: false },
    { method: "GET" as const, url: "/api/batches/batch_1/volumes", write: false },
    {
      method: "POST" as const,
      url: "/api/batches/batch_1/milestones",
      write: true,
      payload: {},
    },
    {
      method: "PATCH" as const,
      url: "/api/batches/batch_1/milestones/GARDE",
      write: true,
      payload: { plannedDurationDays: 30 },
    },
  ];

  it("sans session, toutes les routes sont refusées", async () => {
    for (const route of routes) {
      const res = await inject(app, route.method, route.url, { payload: route.payload });
      expect(res.statusCode).toBe(401);
    }
  });

  it("admin et brasseur accèdent à tout", async () => {
    for (const user of ["admin", "brasseur"]) {
      for (const route of routes) {
        const res = await inject(app, route.method, route.url, {
          cookie: cookieFor(user),
          payload: route.payload,
        });
        expect(res.statusCode).toBeLessThan(400);
      }
    }
  });

  it("caisse lit mais n'écrit pas", async () => {
    for (const route of routes) {
      const res = await inject(app, route.method, route.url, {
        cookie: cookieFor("caisse"),
        payload: route.payload,
      });
      expect(res.statusCode).toBe(route.write ? 403 : 200);
    }
  });

  it("rgpd n'accède à rien du domaine brassage", async () => {
    for (const route of routes) {
      const res = await inject(app, route.method, route.url, {
        cookie: cookieFor("rgpd"),
        payload: route.payload,
      });
      expect(res.statusCode).toBe(403);
    }
  });
});
