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
  BatchCostInputs,
  BatchCreateData,
  BatchDetailView,
  BatchListFilters,
  BatchOverviewFilters,
  BatchOverviewRow,
  BatchRepository,
  BatchSummaryView,
  BrewedVolumeSummary,
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

/**
 * Repository de brassins en mémoire, qui **compte ses appels** : c'est ainsi
 * qu'on démontre l'absence de N+1 — le nombre d'accès ne doit pas croître avec
 * le nombre de brassins listés.
 */
class InMemoryBatchRepository implements BatchRepository {
  private rows: BatchOverviewRow[] = [];
  /** Volumes par brassin, comme les rendrait l'agrégation SQL. */
  private volumes = new Map<string, { packaged?: number; pitched?: number }>();
  /** Compteur d'accès au stockage, tous points d'entrée confondus. */
  calls = 0;
  tz = "Europe/Paris";

  seed(row: BatchOverviewRow): void {
    this.rows.push(row);
  }
  seedVolume(batchId: string, volume: { packaged?: number; pitched?: number }): void {
    this.volumes.set(batchId, volume);
  }

  listOverview(filters: BatchOverviewFilters): Promise<BatchOverviewRow[]> {
    this.calls += 1;
    let items = [...this.rows];
    if (filters.statuses && filters.statuses.length > 0) {
      items = items.filter((r) => filters.statuses!.includes(r.status));
    }
    if (filters.recipeId) items = items.filter((r) => r.recipeId === filters.recipeId);
    const dateOf = (r: BatchOverviewRow): Date | null => r.brewedAt ?? r.plannedAt;
    if (filters.from)
      items = items.filter((r) => (dateOf(r)?.getTime() ?? 0) >= filters.from!.getTime());
    if (filters.to)
      items = items.filter((r) => (dateOf(r)?.getTime() ?? 0) <= filters.to!.getTime());
    return Promise.resolve(items);
  }

  brewedVolume(from?: Date, to?: Date): Promise<BrewedVolumeSummary> {
    this.calls += 1;
    let totalL = 0;
    let batches = 0;
    for (const [batchId, v] of this.volumes) {
      const row = this.rows.find((r) => r.id === batchId);
      const at = row?.brewedAt ?? row?.plannedAt ?? null;
      if (from && (at?.getTime() ?? 0) < from.getTime()) continue;
      if (to && (at?.getTime() ?? 0) > to.getTime()) continue;
      // Un brassin compte une fois : conditionné s'il est connu, sinon ensemencé.
      const volume = v.packaged ?? v.pitched;
      if (volume === undefined) continue;
      totalL += volume;
      batches += 1;
    }
    return Promise.resolve({ totalL, batches });
  }

  timezone(): Promise<string> {
    this.calls += 1;
    return Promise.resolve(this.tz);
  }

  list(_f: BatchListFilters): Promise<BatchSummaryView[]> {
    return Promise.resolve([]);
  }
  findById(id: string): Promise<BatchDetailView | null> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return Promise.resolve(null);
    const { milestones: _m, dayPhase: _d, ...rest } = row;
    return Promise.resolve({ ...rest, reservations: [] });
  }
  create(_d: BatchCreateData, _r: ReservationInput[], _c: string | null): Promise<BatchDetailView> {
    throw new Error("non sollicité");
  }
  cancel(): Promise<BatchDetailView> {
    throw new Error("non sollicité");
  }
  availableByItem(): Promise<Map<string, number>> {
    return Promise.resolve(new Map());
  }
  addMeasure(_b: string, _d: MeasureCreateData, _l: string | null): Promise<MeasureView> {
    throw new Error("non sollicité");
  }
  listMeasures(_b: string, _t?: MeasureType): Promise<MeasureView[]> {
    return Promise.resolve([]);
  }
  transition(): Promise<BatchDetailView> {
    throw new Error("non sollicité");
  }
  getCostInputs(): Promise<BatchCostInputs | null> {
    return Promise.resolve(null);
  }
}

interface RowOptions {
  id: string;
  batchNumber: number;
  status: BatchStatus;
  recipeName?: string | null;
  recipeSnapshot?: unknown;
  dayPhase?: string | null;
  brewedAt?: Date | null;
  milestones?: { kind: string; plannedEndAt: string; actualEndAt?: string | null }[];
}

function row(options: RowOptions): BatchOverviewRow {
  const base = new Date("2026-04-01T08:00:00Z");
  return {
    id: options.id,
    batchNumber: options.batchNumber,
    recipeId: "rec-1",
    recipeVersion: 1,
    equipmentProfileId: null,
    status: options.status,
    plannedAt: base,
    brewedAt: options.brewedAt === undefined ? base : options.brewedAt,
    fermentedAt: null,
    packagedAt: null,
    completedAt: options.status === "TERMINE" ? new Date("2026-05-20T08:00:00Z") : null,
    createdAt: base,
    updatedAt: base,
    recipeSnapshot:
      options.recipeSnapshot !== undefined
        ? options.recipeSnapshot
        : { name: options.recipeName ?? "IPA maison", engine: "BEER" },
    dayPhase: options.dayPhase ?? null,
    milestones: (options.milestones ?? []).map((m, index) => ({
      kind: m.kind,
      plannedEndAt: new Date(m.plannedEndAt),
      actualEndAt: m.actualEndAt ? new Date(m.actualEndAt) : null,
      sortOrder: index,
    })),
  };
}

const USERS: Record<string, string[]> = {
  admin: ["admin"],
  brasseur: ["brasseur"],
  caisse: ["caisse"],
  rgpd: ["rgpd"],
};

let app: FastifyInstance;
let cookieFor: (user: string) => string;
let batches: InMemoryBatchRepository;

beforeEach(async () => {
  batches = new InMemoryBatchRepository();
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
  app = await buildApp({ config, authRepository: auth, batchRepository: batches });
  await app.ready();
  cookieFor = (user) => app.signCookie(`tok_${user}`);
});

const overview = (query = "", user = "brasseur") =>
  app.inject({
    method: "GET",
    url: `/api/batches/overview${query}`,
    cookies: { [SESSION_COOKIE]: cookieFor(user) },
  });

describe("GET /api/batches/overview — vue Brassins enrichie (M9-09)", () => {
  it("restitue étape courante, prochaine échéance et fin prévue", async () => {
    batches.seed(
      row({
        id: "b1",
        batchNumber: 12,
        status: "EN_FERMENTATION",
        milestones: [
          { kind: "FERMENTATION", plannedEndAt: "2026-04-15T00:00:00Z", actualEndAt: null },
          { kind: "GARDE", plannedEndAt: "2026-05-06T00:00:00Z" },
        ],
      }),
    );

    const body = (await overview()).json();
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item).toMatchObject({
      batchNumber: 12,
      recipeName: "IPA maison",
      engine: "BEER",
      status: "EN_FERMENTATION",
      currentStep: { source: "MILESTONE", code: "FERMENTATION" },
    });
    expect(item.nextDeadline).toMatchObject({ code: "FERMENTATION", date: "2026-04-15" });
    expect(item.plannedEndDate).toBe("2026-05-06");
  });

  it("un brassin en brassage montre sa phase du Jour J", async () => {
    batches.seed(row({ id: "b1", batchNumber: 1, status: "EN_BRASSAGE", dayPhase: "EBULLITION" }));
    const item = (await overview()).json().items[0];
    expect(item.currentStep).toEqual({ source: "DAY", code: "EBULLITION" });
  });

  it("un jalon achevé n'est plus la prochaine échéance", async () => {
    batches.seed(
      row({
        id: "b1",
        batchNumber: 1,
        status: "EN_FERMENTATION",
        milestones: [
          {
            kind: "FERMENTATION",
            plannedEndAt: "2026-04-15T00:00:00Z",
            actualEndAt: "2026-04-16T00:00:00Z",
          },
          { kind: "GARDE", plannedEndAt: "2026-05-06T00:00:00Z" },
        ],
      }),
    );
    const item = (await overview()).json().items[0];
    expect(item.nextDeadline.code).toBe("GARDE");
    expect(item.currentStep.code).toBe("GARDE");
  });

  it("un brassin terminé ou annulé n'a ni étape courante ni échéance", async () => {
    batches.seed(row({ id: "b1", batchNumber: 1, status: "TERMINE" }));
    batches.seed(row({ id: "b2", batchNumber: 2, status: "ANNULE" }));
    const items = (await overview()).json().items;
    for (const item of items) {
      expect(item.currentStep).toBeNull();
      expect(item.nextDeadline).toBeNull();
    }
  });

  it("expose la date calendaire des échéances, pas seulement l'instant", async () => {
    // Fin de garde le 6 mai à minuit heure de Paris = 4 mai… non : 5 mai 22:00Z.
    batches.seed(
      row({
        id: "b1",
        batchNumber: 1,
        status: "EN_FERMENTATION",
        milestones: [{ kind: "GARDE", plannedEndAt: "2026-05-05T22:00:00Z" }],
      }),
    );
    const item = (await overview()).json().items[0];
    expect(item.nextDeadline.date).toBe("2026-05-06");
    // Tronquer l'instant ISO donnerait la veille — le piège de M9-07.
    expect(item.nextDeadline.at.slice(0, 10)).toBe("2026-05-05");
  });

  describe("lecture défensive du recipeSnapshot", () => {
    it("un snapshot corrompu n'empêche pas la liste de se rendre", async () => {
      batches.seed(
        row({ id: "b1", batchNumber: 7, status: "EN_FERMENTATION", recipeSnapshot: null }),
      );
      batches.seed(
        row({ id: "b2", batchNumber: 8, status: "EN_FERMENTATION", recipeSnapshot: "oops" }),
      );
      batches.seed(
        row({ id: "b3", batchNumber: 9, status: "EN_FERMENTATION", recipeSnapshot: {} }),
      );

      const res = await overview();
      expect(res.statusCode).toBe(200);
      // Repli sur le numéro : la liste reste lisible.
      const names = res.json().items.map((i: { recipeName: string }) => i.recipeName);
      expect(names).toEqual(expect.arrayContaining(["Brassin n°7", "Brassin n°8", "Brassin n°9"]));
      expect(res.json().items[0].engine).toBeNull();
    });
  });

  describe("tri par défaut : ce qui réclame une action en tête", () => {
    it("les brassins en cours passent avant les terminés", async () => {
      batches.seed(row({ id: "b1", batchNumber: 1, status: "TERMINE" }));
      batches.seed(
        row({
          id: "b2",
          batchNumber: 2,
          status: "EN_FERMENTATION",
          milestones: [{ kind: "GARDE", plannedEndAt: "2026-06-01T00:00:00Z" }],
        }),
      );
      const items = (await overview()).json().items;
      expect(items.map((i: { batchNumber: number }) => i.batchNumber)).toEqual([2, 1]);
    });

    it("à statut égal, l'échéance la plus proche d'abord", async () => {
      batches.seed(
        row({
          id: "b1",
          batchNumber: 1,
          status: "EN_FERMENTATION",
          milestones: [{ kind: "GARDE", plannedEndAt: "2026-06-01T00:00:00Z" }],
        }),
      );
      batches.seed(
        row({
          id: "b2",
          batchNumber: 2,
          status: "EN_FERMENTATION",
          milestones: [{ kind: "GARDE", plannedEndAt: "2026-04-20T00:00:00Z" }],
        }),
      );
      const items = (await overview()).json().items;
      expect(items.map((i: { batchNumber: number }) => i.batchNumber)).toEqual([2, 1]);
    });

    it("un brassin en cours sans échéance passe après ceux qui en ont une", async () => {
      batches.seed(row({ id: "b1", batchNumber: 1, status: "PLANIFIE" }));
      batches.seed(
        row({
          id: "b2",
          batchNumber: 2,
          status: "EN_FERMENTATION",
          milestones: [{ kind: "GARDE", plannedEndAt: "2026-06-01T00:00:00Z" }],
        }),
      );
      const items = (await overview()).json().items;
      expect(items.map((i: { batchNumber: number }) => i.batchNumber)).toEqual([2, 1]);
    });
  });

  describe("filtres", () => {
    beforeEach(() => {
      batches.seed(row({ id: "b1", batchNumber: 1, status: "EN_BRASSAGE" }));
      batches.seed(row({ id: "b2", batchNumber: 2, status: "EN_FERMENTATION" }));
      batches.seed(row({ id: "b3", batchNumber: 3, status: "TERMINE" }));
      batches.seed(row({ id: "b4", batchNumber: 4, status: "ANNULE" }));
    });

    it("filtre par statut, y compris plusieurs à la fois", async () => {
      expect((await overview("?status=TERMINE")).json().items).toHaveLength(1);
      const multiple = await overview("?status=EN_BRASSAGE&status=EN_FERMENTATION");
      expect(multiple.json().items).toHaveLength(2);
    });

    it("`scope=ongoing` ne garde que ce qui réclame une action", async () => {
      const items = (await overview("?scope=ongoing")).json().items;
      expect(items.map((i: { status: string }) => i.status).sort()).toEqual([
        "EN_BRASSAGE",
        "EN_FERMENTATION",
      ]);
    });

    it("`scope=finished` ne garde que les brassins clos ou annulés", async () => {
      const items = (await overview("?scope=finished")).json().items;
      expect(items.map((i: { status: string }) => i.status).sort()).toEqual(["ANNULE", "TERMINE"]);
    });

    it("filtre par période sur la date de brassage", async () => {
      expect((await overview("?from=2026-05-01")).json().items).toHaveLength(0);
      expect((await overview("?from=2026-01-01&to=2026-12-31")).json().items).toHaveLength(4);
    });

    it("rejette un statut ou une date invalides", async () => {
      expect((await overview("?status=SIESTE")).statusCode).toBe(400);
      expect((await overview("?limit=0")).statusCode).toBe(400);
      expect((await overview("?offset=-1")).statusCode).toBe(400);
    });
  });

  describe("pagination", () => {
    beforeEach(() => {
      for (let i = 1; i <= 40; i += 1) {
        batches.seed(row({ id: `b${i}`, batchNumber: i, status: "TERMINE" }));
      }
    });

    it("taille par défaut, avec le total global", async () => {
      const body = (await overview()).json();
      expect(body.items).toHaveLength(25);
      expect(body).toMatchObject({ total: 40, limit: 25, offset: 0 });
    });

    it("respecte limit et offset", async () => {
      const body = (await overview("?limit=10&offset=35")).json();
      expect(body.items).toHaveLength(5);
      expect(body.offset).toBe(35);
    });

    it("plafonne la taille de page pour ne pas noyer la tablette", async () => {
      const body = (await overview("?limit=5000")).json();
      expect(body.limit).toBe(100);
      expect(body.items).toHaveLength(40);
    });
  });

  it("anti-N+1 : le nombre d'accès ne croît pas avec le nombre de brassins", async () => {
    for (let i = 1; i <= 3; i += 1) {
      batches.seed(row({ id: `b${i}`, batchNumber: i, status: "EN_FERMENTATION" }));
    }
    batches.calls = 0;
    await overview();
    const forThree = batches.calls;

    for (let i = 4; i <= 60; i += 1) {
      batches.seed(row({ id: `b${i}`, batchNumber: i, status: "EN_FERMENTATION" }));
    }
    batches.calls = 0;
    await overview();

    // Deux accès au plus : la liste et le fuseau. Jamais un par brassin.
    expect(batches.calls).toBe(forThree);
    expect(batches.calls).toBeLessThanOrEqual(2);
  });

  it("RBAC : lecture ouverte à admin/brasseur/caisse, refusée à rgpd et aux anonymes", async () => {
    batches.seed(row({ id: "b1", batchNumber: 1, status: "EN_BRASSAGE" }));
    for (const user of ["admin", "brasseur", "caisse"]) {
      expect((await overview("", user)).statusCode).toBe(200);
    }
    expect((await overview("", "rgpd")).statusCode).toBe(403);
    const anonymous = await app.inject({ method: "GET", url: "/api/batches/overview" });
    expect(anonymous.statusCode).toBe(401);
  });

  it("« overview » n'est pas confondu avec un identifiant de brassin", async () => {
    // La route statique doit primer sur `/batches/:id`, sinon la liste
    // répondrait « brassin overview introuvable ».
    batches.seed(row({ id: "b1", batchNumber: 1, status: "EN_BRASSAGE" }));
    const res = await overview();
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toBeDefined();
  });
});

describe("GET /api/batches/brewed-volume — volume brassé agrégé (M9-09 §E)", () => {
  const brewedVolume = (query = "", user = "brasseur") =>
    app.inject({
      method: "GET",
      url: `/api/batches/brewed-volume${query}`,
      cookies: { [SESSION_COOKIE]: cookieFor(user) },
    });

  beforeEach(() => {
    batches.seed(row({ id: "b1", batchNumber: 1, status: "TERMINE" }));
    batches.seed(row({ id: "b2", batchNumber: 2, status: "EN_FERMENTATION" }));
  });

  it("somme les volumes conditionnés", async () => {
    batches.seedVolume("b1", { packaged: 24 });
    batches.seedVolume("b2", { packaged: 18 });
    const body = (await brewedVolume()).json();
    expect(body.brewedVolume).toEqual({ totalL: 42, batches: 2 });
  });

  it("retombe sur le volume ensemencé quand le conditionné est inconnu", async () => {
    batches.seedVolume("b1", { pitched: 25 });
    expect((await brewedVolume()).json().brewedVolume.totalL).toBe(25);
  });

  it("ne compte pas deux fois le même moût", async () => {
    // Un brassin ayant les deux mesures ne vaut que son volume conditionné.
    batches.seedVolume("b1", { packaged: 24, pitched: 25 });
    const body = (await brewedVolume()).json();
    expect(body.brewedVolume).toEqual({ totalL: 24, batches: 1 });
  });

  it("aucun volume connu → zéro, sans erreur", async () => {
    expect((await brewedVolume()).json().brewedVolume).toEqual({ totalL: 0, batches: 0 });
  });

  it("filtre par période", async () => {
    batches.seedVolume("b1", { packaged: 24 });
    expect((await brewedVolume("?from=2026-05-01")).json().brewedVolume.batches).toBe(0);
  });

  it("RBAC : refusé à rgpd", async () => {
    expect((await brewedVolume("", "rgpd")).statusCode).toBe(403);
  });
});
