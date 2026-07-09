/**
 * Accès aux données des batchs (M3-04) + réservations de stock à la planification
 * (M3-05). Interface injectable (Prisma / in-memory). Le `recipeSnapshot` est
 * **immuable** après création (ADR-06/07).
 *
 * Le stock disponible se **dérive** des mouvements append-only (`StockMovement`,
 * delta signé) diminués des réservations `RESERVED` — la logique RECETTE complète
 * (déduction, inventaires, seuils) relève de M5, qui possédera le module `stock`.
 */

import type { BatchStatus, Prisma, PrismaClient, ReservationStatus } from "@brasso/db";

/** Réservation de stock d'un batch (vue). L'unité est celle du `CatalogItem`. */
export interface ReservationView {
  id: string;
  catalogItemId: string;
  quantity: number;
  status: ReservationStatus;
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
