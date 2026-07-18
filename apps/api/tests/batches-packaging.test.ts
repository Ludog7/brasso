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
  CarbonationReadingData,
  ConditioningSettings,
  PackagingCorrectionData,
  PackagingLineView,
  PackagingMovementView,
  PackagingRecordData,
  PackagingRepository,
  PackagingResult,
} from "../src/modules/batches/packaging.repository.js";
import type {
  BatchCostInputs,
  BatchCreateData,
  BatchDetailView,
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
      status === "EN_CONDITIONNEMENT"
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
  list(): Promise<BatchSummaryView[]> {
    return Promise.resolve([]);
  }
  create(_d: BatchCreateData, _r: ReservationInput[], _c: string | null): Promise<BatchDetailView> {
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
  getCostInputs(): Promise<BatchCostInputs | null> {
    return Promise.resolve(null);
  }
}

/** Article de catalogue tel qu'il vivrait en base (vue minimale). */
interface CatalogItemRecord {
  id: string;
  name: string;
  kind: string;
  unit: string;
  sourceBatchId: string | null;
}

/**
 * Repository de conditionnement en mémoire, **transactionnel** : les écritures
 * sont accumulées puis publiées d'un bloc. Un échec en cours de séquence ne doit
 * laisser aucune trace — c'est ce que vérifie le test de transactionnalité.
 */
class InMemoryPackagingRepository implements PackagingRepository {
  readonly catalog = new Map<string, CatalogItemRecord>();
  readonly movements: (PackagingMovementView & { batchId: string; note: string | null })[] = [];
  readonly measures: { batchId: string; type: string; value: number; phase: string }[] = [];
  private lines = new Map<string, PackagingLineView[]>();
  private seq = 0;
  /** Force un échec au milieu de la séquence (test de transactionnalité). */
  failOnLineIndex: number | null = null;

  /** Paramètres de mise en condition (M9-15), surchargeables par test. */
  settings: ConditioningSettings = {
    timezone: "Europe/Paris",
    refermentationDays: 21,
    forcedCarbonationDays: 7,
    carbonationToleranceBar: 0.2,
  };

  conditioningSettings(): Promise<ConditioningSettings> {
    return Promise.resolve(this.settings);
  }

  listPackaging(batchId: string): Promise<PackagingLineView[]> {
    return Promise.resolve([...(this.lines.get(batchId) ?? [])]);
  }

  findLine(batchId: string, lineId: string): Promise<PackagingLineView | null> {
    const found = (this.lines.get(batchId) ?? []).find((l) => l.id === lineId);
    return Promise.resolve(found ?? null);
  }

  recordCarbonationReading(
    batchId: string,
    lineId: string,
    data: CarbonationReadingData,
  ): Promise<PackagingLineView> {
    const lines = this.lines.get(batchId) ?? [];
    const updated = lines.map((l) => (l.id === lineId ? { ...l, ...data } : l));
    this.lines.set(batchId, updated);
    const line = updated.find((l) => l.id === lineId);
    if (!line) throw new Error(`ligne ${lineId} absente`);
    return Promise.resolve(line);
  }

  findProductItem(batchId: string): Promise<{ id: string; name: string } | null> {
    for (const item of this.catalog.values()) {
      if (item.sourceBatchId === batchId && item.kind === "PRODUIT_FINI") {
        return Promise.resolve({ id: item.id, name: item.name });
      }
    }
    return Promise.resolve(null);
  }

  recordPackaging(
    batchId: string,
    data: PackagingRecordData,
    userId: string | null,
  ): Promise<PackagingResult> {
    // Tampon : rien n'est publié tant que la séquence n'est pas complète.
    const pendingCatalog: CatalogItemRecord[] = [];
    const pendingLines: PackagingLineView[] = [];
    const pendingMovements: (PackagingMovementView & { batchId: string; note: string | null })[] =
      [];
    const pendingMeasures = [
      { batchId, type: "VOLUME", value: data.packagedVolumeL, phase: "CONDITIONNEMENT" },
    ];

    let product = [...this.catalog.values()].find(
      (i) => i.sourceBatchId === batchId && i.kind === "PRODUIT_FINI",
    );
    if (!product) {
      product = {
        id: `cat_${++this.seq}`,
        name: data.productName,
        kind: "PRODUIT_FINI",
        unit: "UNIT",
        sourceBatchId: batchId,
      };
      pendingCatalog.push(product);
    }

    let totalUnits = 0;
    for (const [index, line] of data.lines.entries()) {
      if (this.failOnLineIndex === index) {
        return Promise.reject(new Error("échec simulé en milieu de séquence"));
      }
      pendingLines.push({
        id: `pk_${++this.seq}`,
        catalogItemId: product.id,
        containerItemId: line.containerItemId,
        containerVolumeL: line.containerVolumeL,
        quantity: line.quantity,
        conditioningMethod: line.conditioningMethod,
        co2TargetVolumes: line.co2TargetVolumes,
        measuredPressureBar: null,
        measuredTempC: null,
        carbonationValidatedAt: null,
        availableForSaleAt: line.availableForSaleAt,
        packagedAt: new Date("2026-04-10T10:00:00Z"),
        note: data.note,
      });
      totalUnits += line.quantity;
      if (line.containerItemId !== null && line.quantity > 0) {
        pendingMovements.push({
          id: `mv_${++this.seq}`,
          catalogItemId: line.containerItemId,
          delta: -line.quantity,
          reason: "PRODUCTION",
          batchId,
          note: data.note,
        });
      }
    }
    if (totalUnits > 0) {
      pendingMovements.push({
        id: `mv_${++this.seq}`,
        catalogItemId: product.id,
        delta: totalUnits,
        reason: "PRODUCTION",
        batchId,
        note: data.note,
      });
    }

    // Publication atomique.
    for (const item of pendingCatalog) this.catalog.set(item.id, item);
    this.lines.set(batchId, [...(this.lines.get(batchId) ?? []), ...pendingLines]);
    this.movements.push(...pendingMovements);
    this.measures.push(...pendingMeasures);
    void userId;

    return Promise.resolve({
      productItemId: product.id,
      lines: pendingLines,
      movements: pendingMovements.map(({ batchId: _b, note: _n, ...m }) => m),
    });
  }

  recordCorrection(
    batchId: string,
    data: PackagingCorrectionData,
    _userId: string | null,
  ): Promise<PackagingMovementView> {
    const movement = {
      id: `mv_${++this.seq}`,
      catalogItemId: data.catalogItemId,
      delta: data.delta,
      reason: "ADJUSTMENT",
      batchId,
      note: data.note,
    };
    this.movements.push(movement);
    const { batchId: _b, note: _n, ...view } = movement;
    return Promise.resolve(view);
  }

  /** Stock dérivé des mouvements (registre append-only). */
  stockOf(catalogItemId: string): number {
    return this.movements
      .filter((m) => m.catalogItemId === catalogItemId)
      .reduce((sum, m) => sum + m.delta, 0);
  }
}

function batchFixture(over: Partial<BatchDetailView> = {}): BatchDetailView {
  const now = new Date("2026-04-10T08:00:00Z");
  return {
    id: "batch_1",
    batchNumber: 42,
    recipeId: "rec-1",
    recipeVersion: 1,
    equipmentProfileId: null,
    status: "EN_CONDITIONNEMENT",
    plannedAt: null,
    brewedAt: now,
    fermentedAt: now,
    packagedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    recipeSnapshot: { id: "rec-1", name: "IPA maison", steps: [], ingredients: [] },
    reservations: [],
    ...over,
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
let batches: StubBatchRepository;
let packaging: InMemoryPackagingRepository;

beforeEach(async () => {
  batches = new StubBatchRepository();
  packaging = new InMemoryPackagingRepository();
  batches.seed(batchFixture());

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
  app = await buildApp({
    config,
    authRepository: auth,
    batchRepository: batches,
    packagingRepository: packaging,
  });
  await app.ready();
  cookieFor = (user) => app.signCookie(`tok_${user}`);
});

interface InjectOptions {
  cookie?: string;
  payload?: unknown;
}
const inject = (
  method: "GET" | "POST",
  url: string,
  { cookie, payload }: InjectOptions = {},
): ReturnType<FastifyInstance["inject"]> =>
  app.inject({
    method,
    url,
    ...(cookie ? { cookies: { [SESSION_COOKIE]: cookie } } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });

/** Conditionnement de référence : 1 fût de 20 L + 5 bouteilles de 0,75 L. */
const REFERENCE_LINES = [
  { containerItemId: "cat-fut", containerVolumeL: 20, quantity: 1 },
  { containerItemId: "cat-bouteille", containerVolumeL: 0.75, quantity: 5 },
];

const record = (payload: unknown = { lines: REFERENCE_LINES }, user = "brasseur", id = "batch_1") =>
  inject("POST", `/api/batches/${id}/packaging`, { cookie: cookieFor(user), payload });

describe("POST /api/batches/:id/packaging — conditionnement (M9-08)", () => {
  it("crée l'article produit fini, les lignes, les mouvements et termine le brassin", async () => {
    const res = await record();
    expect(res.statusCode).toBe(201);
    const body = res.json();

    // Article produit fini rattaché au brassin, compté en unités.
    const product = packaging.catalog.get(body.productItemId);
    expect(product).toMatchObject({
      kind: "PRODUIT_FINI",
      unit: "UNIT",
      sourceBatchId: "batch_1",
    });
    // Le numéro de brassin figure au nom : c'est ce qui distingue deux lots.
    expect(product?.name).toContain("42");

    expect(body.lines).toHaveLength(2);
    // Volume conditionné déduit des contenants : 20 + 3,75 = 23,75 L.
    expect(body.packagedVolumeL).toBe(23.75);
    expect(packaging.measures).toEqual([
      { batchId: "batch_1", type: "VOLUME", value: 23.75, phase: "CONDITIONNEMENT" },
    ]);
    expect(body.batchStatus).toBe("TERMINE");
  });

  it("incrémente le produit fini et décrémente les contenants consommés", async () => {
    const { productItemId } = (await record()).json();

    // 1 fût + 5 bouteilles = 6 unités vendables entrées en stock.
    expect(packaging.stockOf(productItemId)).toBe(6);
    // …et autant de contenants sortis du stock.
    expect(packaging.stockOf("cat-fut")).toBe(-1);
    expect(packaging.stockOf("cat-bouteille")).toBe(-5);
  });

  it("un contenant non suivi au catalogue ne produit aucun mouvement de sortie", async () => {
    const res = await record({
      lines: [{ containerVolumeL: 0.75, quantity: 4 }], // pas de containerItemId
    });
    const { productItemId } = res.json();
    expect(packaging.stockOf(productItemId)).toBe(4);
    // Seul le mouvement d'entrée du produit fini existe.
    expect(packaging.movements).toHaveLength(1);
  });

  /**
   * Un conditionnement est **additif par nature** : un brassin se conditionne
   * souvent en plusieurs séances (on met en fût aujourd'hui, en bouteilles la
   * semaine suivante). Un second enregistrement ajoute donc au stock au lieu de
   * remplacer — le déduplique r ferait perdre une séance entière.
   *
   * Ce n'est pas en contradiction avec le rejeu offline du Jour J (M4-14) : la
   * file offline couvre la session de brassage, qui s'arrête à l'ensemencement.
   * Le conditionnement a lieu des semaines plus tard, au poste, en ligne.
   */
  it("un second conditionnement s'ajoute au stock et réutilise le même article", async () => {
    const first = await record();
    batches.seed(batchFixture({ status: "EN_CONDITIONNEMENT" })); // seconde séance
    const second = await record({ lines: [{ containerVolumeL: 0.75, quantity: 3 }] });

    expect(second.json().productItemId).toBe(first.json().productItemId);
    // Un seul article produit fini, quel que soit le nombre de séances.
    const finished = [...packaging.catalog.values()].filter((i) => i.kind === "PRODUIT_FINI");
    expect(finished).toHaveLength(1);
    // 6 unités de la première séance + 3 de la seconde.
    expect(packaging.stockOf(first.json().productItemId)).toBe(9);
    expect(await packaging.listPackaging("batch_1")).toHaveLength(3);
  });

  it("une saisie enregistrée deux fois par erreur se rattrape par correction, pas par suppression", async () => {
    const { productItemId } = (await record()).json();
    batches.seed(batchFixture({ status: "EN_CONDITIONNEMENT" }));
    await record(); // doublon involontaire : 12 unités au lieu de 6

    expect(packaging.stockOf(productItemId)).toBe(12);
    const fix = await inject("POST", "/api/batches/batch_1/packaging/corrections", {
      cookie: cookieFor("brasseur"),
      payload: { delta: -6, note: "conditionnement saisi deux fois" },
    });
    expect(fix.statusCode).toBe(201);
    expect(packaging.stockOf(productItemId)).toBe(6);
  });

  it("accepte un brassin encore en fermentation et le mène jusqu'à TERMINE", async () => {
    batches.seed(batchFixture({ status: "EN_FERMENTATION" }));
    const res = await record();
    expect(res.statusCode).toBe(201);
    expect(res.json().batchStatus).toBe("TERMINE");
  });

  it("refuse un brassin non conditionnable (409)", async () => {
    for (const status of ["PLANIFIE", "EN_BRASSAGE", "TERMINE", "ANNULE"] as const) {
      batches.seed(batchFixture({ id: "b2", status }));
      const res = await record({ lines: REFERENCE_LINES }, "brasseur", "b2");
      expect(res.statusCode).toBe(409);
      expect(res.json().error?.code ?? res.json().code).toBe("BATCH_NOT_PACKAGEABLE");
    }
  });

  it("refuse un corps sans ligne, ou une quantité non entière", async () => {
    expect((await record({ lines: [] })).statusCode).toBe(400);
    expect((await record({ lines: [{ containerVolumeL: 0.75, quantity: 2.5 }] })).statusCode).toBe(
      400,
    );
    expect((await record({ lines: [{ containerVolumeL: -1, quantity: 2 }] })).statusCode).toBe(400);
  });

  it("brassin inexistant → 404", async () => {
    expect((await record({ lines: REFERENCE_LINES }, "brasseur", "inconnu")).statusCode).toBe(404);
  });

  it("transactionnalité : un échec en milieu de séquence ne laisse aucune écriture", async () => {
    packaging.failOnLineIndex = 1; // échoue sur la deuxième ligne
    const res = await record();

    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(packaging.movements).toHaveLength(0);
    expect(packaging.measures).toHaveLength(0);
    expect([...packaging.catalog.values()]).toHaveLength(0);
    expect(await packaging.listPackaging("batch_1")).toHaveLength(0);
    // Et le brassin n'a surtout pas été marqué terminé sans stock en face.
    const batch = await batches.findById("batch_1");
    expect(batch?.status).toBe("EN_CONDITIONNEMENT");
  });
});

describe("GET /api/batches/:id/packaging", () => {
  it("restitue les lignes enregistrées", async () => {
    await record();
    const res = await inject("GET", "/api/batches/batch_1/packaging", {
      cookie: cookieFor("caisse"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().packaging).toHaveLength(2);
  });
});

describe("POST /api/batches/:id/packaging/corrections — correction append-only", () => {
  const correct = (payload: unknown, user = "brasseur") =>
    inject("POST", "/api/batches/batch_1/packaging/corrections", {
      cookie: cookieFor(user),
      payload,
    });

  it("corrige par mouvement inverse, sans toucher au mouvement d'origine", async () => {
    const { productItemId } = (await record()).json();
    const before = packaging.movements.length;

    const res = await correct({ delta: -2, note: "2 bouteilles cassées à la mise en carton" });
    expect(res.statusCode).toBe(201);
    expect(res.json().movement).toMatchObject({ delta: -2, reason: "ADJUSTMENT" });

    // Le registre s'allonge, il ne se réécrit pas.
    expect(packaging.movements).toHaveLength(before + 1);
    expect(packaging.stockOf(productItemId)).toBe(4);
  });

  it("exige un motif et un delta non nul", async () => {
    await record();
    expect((await correct({ delta: -2 })).statusCode).toBe(400);
    expect((await correct({ delta: 0, note: "rien" })).statusCode).toBe(400);
    expect((await correct({ delta: -2, note: "" })).statusCode).toBe(400);
  });

  it("refuse la correction d'un brassin jamais conditionné (409)", async () => {
    const res = await correct({ delta: -1, note: "erreur" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error?.code ?? res.json().code).toBe("NOTHING_TO_CORRECT");
  });

  it("aucune route ne permet de modifier un mouvement existant", async () => {
    await record();
    const movementId = packaging.movements[0]?.id;
    for (const method of ["POST"] as const) {
      const res = await inject(method, `/api/stock/movements/${movementId}`, {
        cookie: cookieFor("admin"),
        payload: { delta: 99 },
      });
      // Route inexistante : le registre n'expose pas de mise à jour.
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("POST /api/batches/:id/packaging/split — aide à la saisie (FORMULES §13.3)", () => {
  it("propose la répartition de référence sans rien écrire", async () => {
    const res = await inject("POST", "/api/batches/batch_1/packaging/split", {
      cookie: cookieFor("brasseur"),
      payload: {
        volumeL: 24,
        containers: [
          { id: "cat-fut", volumeL: 20 },
          { id: "cat-bouteille", volumeL: 0.75 },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().split).toEqual({
      allocations: [
        { id: "cat-fut", volumeL: 20, quantity: 1, usedL: 20 },
        { id: "cat-bouteille", volumeL: 0.75, quantity: 5, usedL: 3.75 },
      ],
      usedL: 23.75,
      remainderL: 0.25,
    });
    // Proposition ≠ enregistrement : rien n'a été écrit.
    expect(packaging.movements).toHaveLength(0);
    expect([...packaging.catalog.values()]).toHaveLength(0);
  });
});

describe("le produit fini s'insère dans le pipeline M7 existant (choix Q10)", () => {
  it("l'article créé est un CatalogItem, donc mappable en caisse et affichable au bar", async () => {
    const { productItemId } = (await record()).json();
    const product = packaging.catalog.get(productItemId);

    // C'est tout l'enjeu du choix Q10 : le produit fini n'est pas un store à
    // part, c'est un `CatalogItem`. `SkuMapping.catalogItemId` et
    // `DisplayScreenItem.catalogItemId` pointent déjà dessus — donc la vente le
    // décrémente et l'écran bar l'affiche sans une ligne de code nouvelle.
    expect(product).toBeDefined();
    expect(product?.kind).toBe("PRODUIT_FINI");
    expect(product?.sourceBatchId).toBe("batch_1");

    // Un référentiel de catalogue le renvoie comme n'importe quel article.
    const listed = [...packaging.catalog.values()].map((i) => i.id);
    expect(listed).toContain(productItemId);
  });

  it("l'unité de stock est le brassin : deux brassins donnent deux articles", async () => {
    const first = (await record()).json().productItemId;

    batches.seed(batchFixture({ id: "batch_2", batchNumber: 43 }));
    const second = (await record({ lines: REFERENCE_LINES }, "brasseur", "batch_2")).json()
      .productItemId;

    // Agréger par recette détruirait la traçabilité de lot (rappel, DLU).
    expect(second).not.toBe(first);
    expect(packaging.catalog.get(first)?.sourceBatchId).toBe("batch_1");
    expect(packaging.catalog.get(second)?.sourceBatchId).toBe("batch_2");
  });
});

describe("mise en condition avant vente (M9-15)", () => {
  /** Ligne de bouteilles en refermentation — la case cochée à l'écran. */
  const BOTTLES_REFERMENTED = {
    containerItemId: "cat-bouteille",
    containerVolumeL: 0.75,
    quantity: 20,
    conditioningMethod: "REFERMENTATION",
  };
  /** Ligne de fûts en carbonatation forcée, 2,4 volumes de CO₂ visés. */
  const KEGS_FORCED = {
    containerItemId: "cat-fut",
    containerVolumeL: 20,
    quantity: 2,
    conditioningMethod: "FORCED_CARBONATION",
    co2TargetVolumes: 2.4,
  };

  const lineOf = async (kind: string): Promise<PackagingLineView> => {
    const lines = await packaging.listPackaging("batch_1");
    const found = lines.find((l) => l.conditioningMethod === kind);
    if (!found) throw new Error(`aucune ligne ${kind}`);
    return found;
  };

  const readPressure = (lineId: string, payload: unknown, user = "brasseur") =>
    inject("POST", `/api/batches/batch_1/packaging/${lineId}/carbonation`, {
      cookie: cookieFor(user),
      payload,
    });

  it("refermentation en bouteille : mise en vente estimée à +21 jours", async () => {
    await record({ lines: [BOTTLES_REFERMENTED] });
    const line = await lineOf("REFERMENTATION");

    // Le délai court dès la mise en bouteille : la levure travaille tout de suite.
    expect(line.availableForSaleAt).not.toBeNull();
    const days = (line.availableForSaleAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(20);
    expect(days).toBeLessThan(22);
  });

  it("sans mise en condition déclarée, aucune date de mise en vente", async () => {
    // Une bière plate n'est pas vendable : on ne date pas ce qui n'a pas été
    // mis en condition.
    await record({ lines: [{ containerVolumeL: 0.75, quantity: 4 }] });
    const line = (await packaging.listPackaging("batch_1"))[0];
    expect(line?.conditioningMethod).toBe("NONE");
    expect(line?.availableForSaleAt).toBeNull();
  });

  it("carbonatation forcée : aucune date tant que la pression n'est pas relevée", async () => {
    await record({ lines: [KEGS_FORCED] });
    const line = await lineOf("FORCED_CARBONATION");
    // Dater depuis la mise en fût promettrait une bière prête alors que le fût
    // peut être resté plat.
    expect(line.availableForSaleAt).toBeNull();
  });

  it("un relevé atteignant la cible fixe la mise en vente à +7 jours", async () => {
    await record({ lines: [KEGS_FORCED] });
    const line = await lineOf("FORCED_CARBONATION");

    // Pression correcte pour 2,4 volumes à 4 °C (~0,744 bar, FORMULES §8.2).
    const target = await inject("POST", "/api/batches/batch_1/packaging/pressure", {
      cookie: cookieFor("brasseur"),
      payload: { co2TargetVolumes: 2.4, tempC: 4 },
    });
    const targetBar = target.json().target.targetBar;
    expect(targetBar).toBeGreaterThan(0.7);
    expect(targetBar).toBeLessThan(0.8);

    const res = await readPressure(line.id, { pressureBar: targetBar, tempC: 4 });
    expect(res.statusCode).toBe(201);
    const reading = res.json().reading;
    expect(reading.onTarget).toBe(true);
    expect(reading.pendingReason).toBeNull();

    const days =
      (new Date(reading.line.availableForSaleAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThan(8);
  });

  it("la cible est jugée à la température RELEVÉE, pas à celle espérée", async () => {
    await record({ lines: [KEGS_FORCED] });
    const line = await lineOf("FORCED_CARBONATION");

    // 0,744 bar conviendrait à 4 °C ; à 12 °C il en faut ~1,25 — la bière est
    // donc sous-carbonatée, et le relevé ne doit pas la déclarer prête.
    const res = await readPressure(line.id, { pressureBar: 0.744, tempC: 12 });
    const reading = res.json().reading;

    expect(reading.onTarget).toBe(false);
    expect(reading.deltaBar).toBeLessThan(0);
    expect(reading.line.availableForSaleAt).toBeNull();
    expect(reading.pendingReason).toMatch(/relevé de pression/i);
  });

  it("un relevé hors cible est conservé : c'est un constat, pas un échec effacé", async () => {
    await record({ lines: [KEGS_FORCED] });
    const line = await lineOf("FORCED_CARBONATION");
    await readPressure(line.id, { pressureBar: 0.3, tempC: 4 });

    const after = await lineOf("FORCED_CARBONATION");
    expect(after.measuredPressureBar).toBe(0.3);
    expect(after.measuredTempC).toBe(4);
    expect(after.carbonationValidatedAt).toBeNull();
  });

  it("l'opérateur réajuste puis relève à nouveau, et la date se fixe alors", async () => {
    await record({ lines: [KEGS_FORCED] });
    const line = await lineOf("FORCED_CARBONATION");

    await readPressure(line.id, { pressureBar: 0.3, tempC: 4 }); // trop bas
    expect((await lineOf("FORCED_CARBONATION")).availableForSaleAt).toBeNull();

    const ok = await readPressure(line.id, { pressureBar: 0.744, tempC: 4 });
    expect(ok.json().reading.onTarget).toBe(true);
    expect((await lineOf("FORCED_CARBONATION")).availableForSaleAt).not.toBeNull();
  });

  it("fûts et bouteilles du même brassin ont deux dates distinctes", async () => {
    await record({ lines: [BOTTLES_REFERMENTED, KEGS_FORCED] });

    const bottles = await lineOf("REFERMENTATION");
    const kegs = await lineOf("FORCED_CARBONATION");
    // Les bouteilles sont datées tout de suite, les fûts attendent le relevé :
    // les deux ne sont pas prêts en même temps, d'où la méthode par contenant.
    expect(bottles.availableForSaleAt).not.toBeNull();
    expect(kegs.availableForSaleAt).toBeNull();

    await readPressure(kegs.id, { pressureBar: 0.744, tempC: 4 });
    const kegsAfter = await lineOf("FORCED_CARBONATION");
    expect(kegsAfter.availableForSaleAt).not.toBeNull();
    // Fûts prêts avant les bouteilles : 7 jours contre 21.
    expect(kegsAfter.availableForSaleAt!.getTime()).toBeLessThan(
      bottles.availableForSaleAt!.getTime(),
    );
  });

  it("expose la date calendaire à côté de l'instant", async () => {
    await record({ lines: [BOTTLES_REFERMENTED] });
    const res = await inject("GET", "/api/batches/batch_1/packaging", {
      cookie: cookieFor("brasseur"),
    });
    const line = res.json().packaging[0];
    // Même piège qu'en M9-07 : tronquer l'instant ISO annoncerait la bière
    // vendable un jour trop tôt.
    expect(line.availableForSaleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("les délais viennent des Settings, pas de constantes", async () => {
    packaging.settings = { ...packaging.settings, refermentationDays: 30 };
    await record({ lines: [BOTTLES_REFERMENTED] });
    const line = await lineOf("REFERMENTATION");
    const days = (line.availableForSaleAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
  });

  it("relever une pression sur des bouteilles est refusé (409)", async () => {
    await record({ lines: [BOTTLES_REFERMENTED] });
    const line = await lineOf("REFERMENTATION");
    const res = await readPressure(line.id, { pressureBar: 0.744, tempC: 4 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error?.code ?? res.json().code).toBe("NOT_FORCED_CARBONATION");
  });

  it("ligne inexistante → 404", async () => {
    await record({ lines: [KEGS_FORCED] });
    expect((await readPressure("inconnue", { pressureBar: 0.7, tempC: 4 })).statusCode).toBe(404);
  });

  it("caisse ne relève pas de pression (écriture de stock)", async () => {
    await record({ lines: [KEGS_FORCED] });
    const line = await lineOf("FORCED_CARBONATION");
    const res = await readPressure(line.id, { pressureBar: 0.744, tempC: 4 }, "caisse");
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC du conditionnement (écriture de stock, ADR-10)", () => {
  const writeRoutes = [
    { url: "/api/batches/batch_1/packaging", payload: { lines: REFERENCE_LINES } },
    {
      url: "/api/batches/batch_1/packaging/corrections",
      payload: { delta: -1, note: "erreur de saisie" },
    },
  ];

  it("sans session, tout est refusé", async () => {
    for (const route of writeRoutes) {
      expect((await inject("POST", route.url, { payload: route.payload })).statusCode).toBe(401);
    }
  });

  it("caisse ne conditionne pas et ne corrige pas", async () => {
    for (const route of writeRoutes) {
      const res = await inject("POST", route.url, {
        cookie: cookieFor("caisse"),
        payload: route.payload,
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it("rgpd n'accède ni au stock ni au conditionnement", async () => {
    for (const route of writeRoutes) {
      const res = await inject("POST", route.url, {
        cookie: cookieFor("rgpd"),
        payload: route.payload,
      });
      expect(res.statusCode).toBe(403);
    }
    expect(
      (await inject("GET", "/api/batches/batch_1/packaging", { cookie: cookieFor("rgpd") }))
        .statusCode,
    ).toBe(403);
  });

  it("admin et brasseur conditionnent", async () => {
    for (const user of ["admin", "brasseur"]) {
      batches.seed(batchFixture({ id: `b_${user}` }));
      const res = await record({ lines: REFERENCE_LINES }, user, `b_${user}`);
      expect(res.statusCode).toBe(201);
    }
  });
});
