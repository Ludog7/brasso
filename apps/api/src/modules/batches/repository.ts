/**
 * Accès aux données des batchs (M3-04). Interface injectable (Prisma / in-memory)
 * — même approche que `recipes`. Le `recipeSnapshot` est **immuable** après
 * création (ADR-06/07) : aucune méthode ne le modifie.
 */

import type { BatchStatus, Prisma, PrismaClient } from "@brasso/db";

/** Vue résumée d'un batch (liste) — sans le snapshot. */
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

/** Vue détaillée : résumé + snapshot figé de la recette. */
export interface BatchDetailView extends BatchSummaryView {
  recipeSnapshot: unknown;
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

export interface BatchRepository {
  list(filters: BatchListFilters): Promise<BatchSummaryView[]>;
  findById(id: string): Promise<BatchDetailView | null>;
  create(data: BatchCreateData): Promise<BatchDetailView>;
  updateStatus(id: string, status: BatchStatus): Promise<BatchDetailView>;
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
    return this.prisma.batch.findUnique({
      where: { id },
      select: { ...SUMMARY_SELECT, recipeSnapshot: true },
    });
  }

  create(data: BatchCreateData): Promise<BatchDetailView> {
    return this.prisma.batch.create({
      data: {
        recipeId: data.recipeId,
        recipeVersion: data.recipeVersion,
        recipeSnapshot: data.recipeSnapshot,
        equipmentProfileId: data.equipmentProfileId,
        status: "PLANIFIE",
        plannedAt: data.plannedAt,
      },
      select: { ...SUMMARY_SELECT, recipeSnapshot: true },
    });
  }

  updateStatus(id: string, status: BatchStatus): Promise<BatchDetailView> {
    return this.prisma.batch.update({
      where: { id },
      data: { status },
      select: { ...SUMMARY_SELECT, recipeSnapshot: true },
    });
  }
}
