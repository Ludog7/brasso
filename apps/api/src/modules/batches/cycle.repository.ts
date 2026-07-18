/**
 * Accès aux données du **cycle post-Jour J** d'un brassin (M9-07) : jalons datés
 * (`BatchMilestone`, M9-02), entrées de la chaîne des volumes et paramètres de
 * cycle lus des `Settings`.
 *
 * Interface injectable (Prisma / in-memory). Aucune règle métier ici : les dates
 * viennent de `buildBatchMilestones` et les volumes de `batchVolumeChain`, tous
 * deux dans `@brasso/core` (ADR-03).
 */

import type { BatchMilestoneKind, PrismaClient } from "@brasso/db";

/** Jalon daté persisté (vue DB-agnostique). */
export interface MilestoneView {
  id: string;
  kind: BatchMilestoneKind;
  plannedDurationDays: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  sortOrder: number;
}

/** Jalon à écrire — le service a déjà fait calculer les dates par `core`. */
export interface MilestoneWriteData {
  kind: BatchMilestoneKind;
  plannedDurationDays: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
  sortOrder: number;
}

/** Champs réels d'un jalon, renseignés au fil de l'eau. */
export interface MilestoneActualPatch {
  actualStartAt?: Date | null;
  actualEndAt?: Date | null;
}

/**
 * Paramètres de cycle lus des `Settings` (M9-02). `core` n'en code aucune valeur
 * par défaut (ADR-01) : ils sont lus ici puis **fournis en entrée** au calcul.
 */
export interface CycleDefaults {
  /** Fuseau de l'instance (IANA) — l'ajout de jours est calendaire (FORMULES §13.1). */
  timezone: string;
  fermentationDays: number;
  dryHopDays: number;
  coldCrashDays: number;
  gardeDays: number;
}

/** Ligne de conditionnement d'un brassin (`BatchPackaging`, écrite en M9-08). */
export interface PackagingLineView {
  containerVolumeL: number;
  quantity: number;
}

/**
 * Entrées de la chaîne des volumes (M9-06). Les mesures `VOLUME` sont reprises
 * telles quelles avec leur `phase` Jour J : c'est le service qui les aiguille
 * vers les maillons de la chaîne, `core` qui les enchaîne.
 */
export interface BatchVolumeInputs {
  /** Durée d'ébullition (min) lue du `recipeSnapshot` figé, ou `null`. */
  boilTimeMin: number | null;
  /** Pertes du profil d'équipement du batch, ou `null` s'il n'en a pas. */
  equipment: {
    deadspaceL: number;
    transferLossL: number;
    evaporationRateLPerHour: number;
  } | null;
  /** Mesures de volume relevées, avec la phase Jour J où elles ont été prises. */
  volumeMeasures: { phase: string | null; value: number }[];
  /** Contenants saisis au conditionnement (M9-08) — vide tant qu'il n'a pas eu lieu. */
  packaging: PackagingLineView[];
}

export interface BatchCycleRepository {
  /** Paramètres de cycle de l'instance (`Settings`), avec les défauts du schéma. */
  cycleDefaults(): Promise<CycleDefaults>;
  /** Jalons d'un brassin, dans l'ordre de la séquence. */
  listMilestones(batchId: string): Promise<MilestoneView[]>;
  /**
   * Remplace la séquence de jalons d'un brassin (atomique). Utilisé à la création
   * et au recalcul en cascade — le service a déjà écarté les jalons achevés.
   */
  saveMilestones(batchId: string, milestones: MilestoneWriteData[]): Promise<MilestoneView[]>;
  /** Renseigne les dates **réelles** d'un jalon ; `null` si le jalon n'existe pas. */
  updateMilestoneActuals(
    batchId: string,
    kind: BatchMilestoneKind,
    patch: MilestoneActualPatch,
  ): Promise<MilestoneView | null>;
  /** Entrées de la chaîne des volumes ; `null` si le brassin n'existe pas. */
  getVolumeInputs(batchId: string): Promise<BatchVolumeInputs | null>;
}

/** Durée d'ébullition (min) lue défensivement du `recipeSnapshot` (JSONB opaque). */
function boilTimeFromSnapshot(snapshot: unknown): number | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const details = (snapshot as { beerDetails?: unknown }).beerDetails;
  if (typeof details !== "object" || details === null) return null;
  const value = (details as { boilTimeMin?: unknown }).boilTimeMin;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const MILESTONE_SELECT = {
  id: true,
  kind: true,
  plannedDurationDays: true,
  plannedStartAt: true,
  plannedEndAt: true,
  actualStartAt: true,
  actualEndAt: true,
  sortOrder: true,
} as const;

export class PrismaBatchCycleRepository implements BatchCycleRepository {
  constructor(private readonly db: PrismaClient) {}

  async cycleDefaults(): Promise<CycleDefaults> {
    const settings = await this.db.settings.findFirst({
      select: {
        timezone: true,
        defaultFermentationDays: true,
        defaultDryHopDays: true,
        defaultColdCrashDays: true,
        defaultConditioningDays: true,
      },
    });
    // Mêmes valeurs que les `@default` du schéma : une instance sans ligne
    // `Settings` reste exploitable plutôt que de faire échouer l'ensemencement.
    return {
      timezone: settings?.timezone ?? "Europe/Paris",
      fermentationDays: settings?.defaultFermentationDays ?? 14,
      dryHopDays: settings?.defaultDryHopDays ?? 3,
      coldCrashDays: settings?.defaultColdCrashDays ?? 2,
      gardeDays: settings?.defaultConditioningDays ?? 21,
    };
  }

  listMilestones(batchId: string): Promise<MilestoneView[]> {
    return this.db.batchMilestone.findMany({
      where: { batchId },
      orderBy: { sortOrder: "asc" },
      select: MILESTONE_SELECT,
    });
  }

  async saveMilestones(
    batchId: string,
    milestones: MilestoneWriteData[],
  ): Promise<MilestoneView[]> {
    await this.db.$transaction(async (tx) => {
      for (const m of milestones) {
        await tx.batchMilestone.upsert({
          where: { batchId_kind: { batchId, kind: m.kind } },
          // Un jalon existant garde ses dates **réelles** : seule la prévision
          // est réécrite (le service a déjà exclu les jalons achevés).
          update: {
            plannedDurationDays: m.plannedDurationDays,
            plannedStartAt: m.plannedStartAt,
            plannedEndAt: m.plannedEndAt,
            sortOrder: m.sortOrder,
          },
          create: { batchId, ...m },
        });
      }
      // Une phase retirée de la séquence (durée passée à 0, dry hop supprimé)
      // ne doit pas survivre en base.
      await tx.batchMilestone.deleteMany({
        where: { batchId, kind: { notIn: milestones.map((m) => m.kind) } },
      });
    });
    return this.listMilestones(batchId);
  }

  async updateMilestoneActuals(
    batchId: string,
    kind: BatchMilestoneKind,
    patch: MilestoneActualPatch,
  ): Promise<MilestoneView | null> {
    const existing = await this.db.batchMilestone.findUnique({
      where: { batchId_kind: { batchId, kind } },
      select: { id: true },
    });
    if (!existing) return null;
    return this.db.batchMilestone.update({
      where: { batchId_kind: { batchId, kind } },
      data: {
        ...(patch.actualStartAt !== undefined ? { actualStartAt: patch.actualStartAt } : {}),
        ...(patch.actualEndAt !== undefined ? { actualEndAt: patch.actualEndAt } : {}),
      },
      select: MILESTONE_SELECT,
    });
  }

  async getVolumeInputs(batchId: string): Promise<BatchVolumeInputs | null> {
    const batch = await this.db.batch.findUnique({
      where: { id: batchId },
      select: {
        recipeSnapshot: true,
        equipmentProfile: {
          select: { deadspaceL: true, transferLossL: true, evaporationRateLPerHour: true },
        },
        measures: {
          where: { type: "VOLUME" },
          orderBy: { loggedAt: "asc" },
          select: { phase: true, value: true },
        },
        packagings: { select: { containerVolumeL: true, quantity: true } },
      },
    });
    if (!batch) return null;
    return {
      boilTimeMin: boilTimeFromSnapshot(batch.recipeSnapshot),
      equipment: batch.equipmentProfile,
      volumeMeasures: batch.measures,
      packaging: batch.packagings,
    };
  }
}
