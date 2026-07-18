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

  listPackaging(batchId: string): Promise<PackagingLineView[]> {
    return Promise.resolve([...(this.lines.get(batchId) ?? [])]);
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

describe("POST /api/batches/:id/packaging:split — aide à la saisie (FORMULES §13.3)", () => {
  it("propose la répartition de référence sans rien écrire", async () => {
    const res = await inject("POST", "/api/batches/batch_1/packaging:split", {
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
