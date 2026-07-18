/**
 * Accès aux données des batchs (M3-04) + réservations de stock à la planification
 * (M3-05). Interface injectable (Prisma / in-memory). Le `recipeSnapshot` est
 * **immuable** après création (ADR-06/07).
 *
 * Le stock disponible se **dérive** des mouvements append-only (`StockMovement`,
 * delta signé) diminués des réservations `RESERVED` — la logique RECETTE complète
 * (déduction, inventaires, seuils) relève de M5, qui possédera le module `stock`.
 */

import type { BatchStatus, MeasureType, Prisma, PrismaClient, ReservationStatus } from "@brasso/db";

import {
  consumeReservationsForBatch,
  plannedVolumeFromSnapshot,
  prismaConsumePort,
} from "../stock/consume.js";

/** Réservation de stock d'un batch (vue). L'unité est celle du `CatalogItem`. */
export interface ReservationView {
  id: string;
  catalogItemId: string;
  quantity: number;
  status: ReservationStatus;
}

/** Mesure relevée sur un batch (vue append-only). */
export interface MeasureView {
  id: string;
  type: MeasureType;
  value: number;
  unit: string | null;
  phase: string | null;
  loggedById: string | null;
  loggedAt: Date;
}

/** Données d'une mesure à enregistrer (le service a validé bornes + type). */
export interface MeasureCreateData {
  type: MeasureType;
  value: number;
  unit?: string;
  phase?: string;
  /** Antidatage optionnel ; sinon `now()` (défaut DB). */
  loggedAt?: Date;
}

/** Vue résumée d'un batch (liste) — sans snapshot ni réservations. */
export interface BatchSummaryView {
  id: string;
  batchNumber: number;
  recipeId: string;
  recipeVersion: number;
  equipmentProfileId: string | null;
  status: BatchStatus;
  plannedAt: Date | null;
  brewedAt: Date | null;
  fermentedAt: Date | null;
  packagedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Vue détaillée : résumé + snapshot figé + réservations de stock. */
export interface BatchDetailView extends BatchSummaryView {
  recipeSnapshot: unknown;
  reservations: ReservationView[];
}

export interface BatchListFilters {
  status?: BatchStatus;
  recipeId?: string;
}

/** Filtres de la vue « Brassins » enrichie (M9-09). */
export interface BatchOverviewFilters {
  /** Statuts retenus ; vide = tous. */
  statuses?: BatchStatus[];
  recipeId?: string;
  /** Période sur les dates clés du brassin (planifié / brassé). */
  from?: Date;
  to?: Date;
}

/**
 * Ligne brute de la vue « Brassins » : le brassin, son état du jour et ses
 * jalons, chargés en **requêtes groupées** (jamais une par brassin — le N+1
 * ferait ramer la tablette dès quelques dizaines de brassins).
 */
export interface BatchOverviewRow extends BatchSummaryView {
  /** Snapshot figé — le nom de recette s'y lit **défensivement** côté service. */
  recipeSnapshot: unknown;
  /** Phase Jour J courante (`BatchDayState.phase`), `null` hors session. */
  dayPhase: string | null;
  /** Jalons du cycle, ordonnés ; vides tant que l'ensemencement n'a pas eu lieu. */
  milestones: {
    kind: string;
    plannedEndAt: Date;
    actualEndAt: Date | null;
    sortOrder: number;
  }[];
}

/** Volume brassé agrégé sur une période (M9-09 §E, tuile M13). */
export interface BrewedVolumeSummary {
  /** Volume total (L) : conditionné quand il est connu, sinon ensemencé. */
  totalL: number;
  /** Nombre de brassins ayant contribué. */
  batches: number;
}

/** Données de planification (le service a validé + dérivé version/snapshot). */
export interface BatchCreateData {
  recipeId: string;
  recipeVersion: number;
  recipeSnapshot: Prisma.InputJsonValue;
  equipmentProfileId: string | null;
  plannedAt: Date | null;
}

/** Réservation à poser (quantité dans l'unité de l'article). */
export interface ReservationInput {
  catalogItemId: string;
  quantity: number;
}

/** Une ligne de coût (quantité + coût unitaire catalogue, `null` si inconnu). */
export interface CostLine {
  quantity: number;
  unitCostCents: number | null;
}

/**
 * Entrées du coût de revient d'un batch (M5-06), valorisées au coût **catalogue**
 * (`defaultUnitCostCents`). `produced` = mouvements `PRODUCTION` (quantités
 * réellement consommées, M5-05) ; `reservations` = réservations `RESERVED`
 * (estimation planifiée) ; `conditioning` = mouvements sur articles
 * `CONDITIONNEMENT` du batch.
 */
export interface BatchCostInputs {
  plannedVolumeL: number | null;
  actualVolumeL: number | null;
  reservations: CostLine[];
  produced: CostLine[];
  conditioning: CostLine[];
}

export interface BatchRepository {
  list(filters: BatchListFilters): Promise<BatchSummaryView[]>;
  /**
   * Brassins de la vue enrichie (M9-09), avec état du jour et jalons chargés en
   * **requêtes groupées**. Rend l'ensemble filtré : le tri (« en cours d'abord,
   * puis prochaine échéance ») dépend des jalons et ne s'exprime pas en SQL
   * simple, il est donc appliqué par le service, qui pagine ensuite. Le volume
   * reste borné par les filtres — une brasserie associative compte des dizaines
   * de brassins, pas des millions.
   */
  listOverview(filters: BatchOverviewFilters): Promise<BatchOverviewRow[]>;
  /** Volume brassé sur une période (conditionné, à défaut ensemencé). */
  brewedVolume(from?: Date, to?: Date): Promise<BrewedVolumeSummary>;
  /** Fuseau de l'instance (`Settings.timezone`) — pour les dates calendaires. */
  timezone(): Promise<string>;
  findById(id: string): Promise<BatchDetailView | null>;
  /** Crée un batch **et** ses réservations `RESERVED` (atomique). */
  create(
    data: BatchCreateData,
    reservations: ReservationInput[],
    createdById: string | null,
  ): Promise<BatchDetailView>;
  /** Annule un batch (`ANNULE`) et libère ses réservations (`RELEASED`) — atomique. */
  cancel(id: string): Promise<BatchDetailView>;
  /** Stock disponible par article : Σ mouvements − Σ réservations `RESERVED`. */
  availableByItem(catalogItemIds: string[]): Promise<Map<string, number>>;
  /** Enregistre une mesure append-only. `loggedById` = utilisateur courant. */
  addMeasure(
    batchId: string,
    data: MeasureCreateData,
    loggedById: string | null,
  ): Promise<MeasureView>;
  /** Mesures d'un batch, chronologiques (`loggedAt` croissant), filtrables par type. */
  listMeasures(batchId: string, type?: MeasureType): Promise<MeasureView[]>;
  /**
   * Applique une transition de statut simple (hors state machine Jour J) et
   * horodate le jalon correspondant. Le service a déjà validé la légalité.
   * L'entrée en `EN_FERMENTATION` **consomme** les réservations du batch (M5-05)
   * dans la même transaction ; `actorId` = auteur des mouvements `PRODUCTION`.
   */
  transition(id: string, status: BatchStatus, actorId?: string | null): Promise<BatchDetailView>;
  /** Entrées de coût de revient d'un batch (M5-06) ; `null` si le batch n'existe pas. */
  getCostInputs(batchId: string): Promise<BatchCostInputs | null>;
}

const SUMMARY_SELECT = {
  id: true,
  batchNumber: true,
  recipeId: true,
  recipeVersion: true,
  equipmentProfileId: true,
  status: true,
  plannedAt: true,
  brewedAt: true,
  fermentedAt: true,
  packagedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  recipeSnapshot: true,
  reservations: {
    select: { id: true, catalogItemId: true, quantity: true, status: true },
  },
} as const;

const MEASURE_SELECT = {
  id: true,
  type: true,
  value: true,
  unit: true,
  phase: true,
  loggedById: true,
  loggedAt: true,
} as const;

/** Jalon horodaté par une transition de statut (linéaire, ADR-08 hors périmètre). */
function milestonePatch(status: BatchStatus, at: Date): Prisma.BatchUpdateInput {
  switch (status) {
    case "EN_BRASSAGE":
      return { brewedAt: at };
    case "EN_FERMENTATION":
      return { fermentedAt: at };
    case "EN_CONDITIONNEMENT":
      return { packagedAt: at };
    case "TERMINE":
      return { completedAt: at };
    default:
      return {};
  }
}

export class PrismaBatchRepository implements BatchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOverview(filters: BatchOverviewFilters): Promise<BatchOverviewRow[]> {
    const period =
      filters.from !== undefined || filters.to !== undefined
        ? {
            ...(filters.from !== undefined ? { gte: filters.from } : {}),
            ...(filters.to !== undefined ? { lte: filters.to } : {}),
          }
        : undefined;

    // Une seule requête : les jalons et l'état du jour viennent en `include`,
    // donc groupés par Prisma — jamais une requête par brassin (N+1).
    const rows = await this.prisma.batch.findMany({
      where: {
        ...(filters.statuses && filters.statuses.length > 0
          ? { status: { in: filters.statuses } }
          : {}),
        ...(filters.recipeId ? { recipeId: filters.recipeId } : {}),
        // La période porte sur la date de brassage, à défaut celle planifiée :
        // c'est ainsi qu'un brassin se situe dans le temps à l'atelier.
        ...(period ? { OR: [{ brewedAt: period }, { brewedAt: null, plannedAt: period }] } : {}),
      },
      select: {
        ...SUMMARY_SELECT,
        recipeSnapshot: true,
        dayState: { select: { phase: true } },
        milestones: {
          orderBy: { sortOrder: "asc" },
          select: { kind: true, plannedEndAt: true, actualEndAt: true, sortOrder: true },
        },
      },
      orderBy: { batchNumber: "desc" },
    });

    return rows.map(({ dayState, ...row }) => ({ ...row, dayPhase: dayState?.phase ?? null }));
  }

  async timezone(): Promise<string> {
    const settings = await this.prisma.settings.findFirst({ select: { timezone: true } });
    // Même valeur que le `@default` du schéma : une instance sans ligne
    // `Settings` doit continuer d'afficher ses brassins.
    return settings?.timezone ?? "Europe/Paris";
  }

  async brewedVolume(from?: Date, to?: Date): Promise<BrewedVolumeSummary> {
    const period =
      from !== undefined || to !== undefined
        ? { ...(from !== undefined ? { gte: from } : {}), ...(to !== undefined ? { lte: to } : {}) }
        : undefined;

    // Mesures de volume des brassins de la période, en une requête.
    const measures = await this.prisma.batchMeasure.findMany({
      where: {
        type: "VOLUME",
        phase: { in: ["CONDITIONNEMENT", "ENSEMENCEMENT"] },
        ...(period
          ? { batch: { OR: [{ brewedAt: period }, { brewedAt: null, plannedAt: period }] } }
          : {}),
      },
      orderBy: { loggedAt: "asc" },
      select: { batchId: true, phase: true, value: true },
    });

    // Un brassin compte **une fois** : son volume conditionné s'il est connu,
    // sinon son volume ensemencé. Les additionner compterait le même moût deux
    // fois.
    const byBatch = new Map<string, { packaged?: number; pitched?: number }>();
    for (const m of measures) {
      const entry = byBatch.get(m.batchId) ?? {};
      if (m.phase === "CONDITIONNEMENT") entry.packaged = m.value;
      else entry.pitched = m.value;
      byBatch.set(m.batchId, entry);
    }

    let totalL = 0;
    let batches = 0;
    for (const { packaged, pitched } of byBatch.values()) {
      const volume = packaged ?? pitched;
      if (volume === undefined || !Number.isFinite(volume)) continue;
      totalL += volume;
      batches += 1;
    }
    return { totalL: Math.round(totalL * 1e6) / 1e6, batches };
  }

  list(filters: BatchListFilters): Promise<BatchSummaryView[]> {
    return this.prisma.batch.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.recipeId ? { recipeId: filters.recipeId } : {}),
      },
      select: SUMMARY_SELECT,
      orderBy: { batchNumber: "desc" },
    });
  }

  findById(id: string): Promise<BatchDetailView | null> {
    return this.prisma.batch.findUnique({ where: { id }, select: DETAIL_SELECT });
  }

  create(
    data: BatchCreateData,
    reservations: ReservationInput[],
    createdById: string | null,
  ): Promise<BatchDetailView> {
    return this.prisma.batch.create({
      data: {
        recipeId: data.recipeId,
        recipeVersion: data.recipeVersion,
        recipeSnapshot: data.recipeSnapshot,
        equipmentProfileId: data.equipmentProfileId,
        status: "PLANIFIE",
        plannedAt: data.plannedAt,
        reservations: {
          create: reservations.map((r) => ({
            catalogItemId: r.catalogItemId,
            quantity: r.quantity,
            createdById,
          })),
        },
      },
      select: DETAIL_SELECT,
    });
  }

  cancel(id: string): Promise<BatchDetailView> {
    return this.prisma.$transaction(async (tx) => {
      await tx.stockReservation.updateMany({
        where: { batchId: id, status: "RESERVED" },
        data: { status: "RELEASED" },
      });
      return tx.batch.update({ where: { id }, data: { status: "ANNULE" }, select: DETAIL_SELECT });
    });
  }

  addMeasure(
    batchId: string,
    data: MeasureCreateData,
    loggedById: string | null,
  ): Promise<MeasureView> {
    return this.prisma.batchMeasure.create({
      data: {
        batchId,
        type: data.type,
        value: data.value,
        unit: data.unit ?? null,
        phase: data.phase ?? null,
        loggedById,
        ...(data.loggedAt ? { loggedAt: data.loggedAt } : {}),
      },
      select: MEASURE_SELECT,
    });
  }

  listMeasures(batchId: string, type?: MeasureType): Promise<MeasureView[]> {
    return this.prisma.batchMeasure.findMany({
      where: { batchId, ...(type ? { type } : {}) },
      select: MEASURE_SELECT,
      orderBy: { loggedAt: "asc" },
    });
  }

  transition(
    id: string,
    status: BatchStatus,
    actorId: string | null = null,
  ): Promise<BatchDetailView> {
    const patch = { status, ...milestonePatch(status, new Date()) };
    if (status !== "EN_FERMENTATION") {
      return this.prisma.batch.update({ where: { id }, data: patch, select: DETAIL_SELECT });
    }
    // Ensemencement : passage EN_FERMENTATION + consommation des réservations,
    // atomiquement (M5-05). La consommation est idempotente (re-lecture après).
    return this.prisma.$transaction(async (tx) => {
      await tx.batch.update({ where: { id }, data: patch });
      await consumeReservationsForBatch(prismaConsumePort(tx), id, actorId);
      return tx.batch.findUniqueOrThrow({ where: { id }, select: DETAIL_SELECT });
    });
  }

  async getCostInputs(batchId: string): Promise<BatchCostInputs | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { recipeSnapshot: true },
    });
    if (!batch) {
      return null;
    }
    const [volumeMeasure, reservations, movements] = await this.prisma.$transaction([
      this.prisma.batchMeasure.findFirst({
        where: { batchId, type: "VOLUME" },
        orderBy: { loggedAt: "desc" },
        select: { value: true },
      }),
      this.prisma.stockReservation.findMany({
        where: { batchId, status: "RESERVED" },
        select: { quantity: true, catalogItem: { select: { defaultUnitCostCents: true } } },
      }),
      this.prisma.stockMovement.findMany({
        where: { batchId },
        select: {
          delta: true,
          reason: true,
          catalogItem: { select: { kind: true, defaultUnitCostCents: true } },
        },
      }),
    ]);

    const produced: CostLine[] = movements
      .filter((m) => m.reason === "PRODUCTION" && m.catalogItem.kind !== "CONDITIONNEMENT")
      .map((m) => ({
        quantity: Math.abs(m.delta),
        unitCostCents: m.catalogItem.defaultUnitCostCents,
      }));
    const conditioning: CostLine[] = movements
      .filter((m) => m.catalogItem.kind === "CONDITIONNEMENT")
      .map((m) => ({
        quantity: Math.abs(m.delta),
        unitCostCents: m.catalogItem.defaultUnitCostCents,
      }));
    const reservationLines: CostLine[] = reservations.map((r) => ({
      quantity: r.quantity,
      unitCostCents: r.catalogItem.defaultUnitCostCents,
    }));

    return {
      plannedVolumeL: plannedVolumeFromSnapshot(batch.recipeSnapshot),
      actualVolumeL: volumeMeasure?.value ?? null,
      reservations: reservationLines,
      produced,
      conditioning,
    };
  }

  async availableByItem(catalogItemIds: string[]): Promise<Map<string, number>> {
    const available = new Map<string, number>();
    if (catalogItemIds.length === 0) return available;
    for (const id of catalogItemIds) available.set(id, 0);

    const [movements, reserved] = await Promise.all([
      this.prisma.stockMovement.groupBy({
        by: ["catalogItemId"],
        where: { catalogItemId: { in: catalogItemIds } },
        _sum: { delta: true },
      }),
      this.prisma.stockReservation.groupBy({
        by: ["catalogItemId"],
        where: { catalogItemId: { in: catalogItemIds }, status: "RESERVED" },
        _sum: { quantity: true },
      }),
    ]);
    for (const m of movements) available.set(m.catalogItemId, m._sum.delta ?? 0);
    for (const r of reserved) {
      available.set(
        r.catalogItemId,
        (available.get(r.catalogItemId) ?? 0) - (r._sum.quantity ?? 0),
      );
    }
    return available;
  }
}
