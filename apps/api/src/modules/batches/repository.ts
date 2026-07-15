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

import { consumeReservationsForBatch, prismaConsumePort } from "../stock/consume.js";

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

export interface BatchRepository {
  list(filters: BatchListFilters): Promise<BatchSummaryView[]>;
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
