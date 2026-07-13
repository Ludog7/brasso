/**
 * Accès aux données de la **session Jour J** d'un batch (M4-04). Interface
 * injectable (Prisma / in-memory), comme le reste du module `batches`.
 *
 * Le serveur est la source de vérité (ADR-08) : la DB porte l'instantané `state`
 * (forme `dayStateSchema`, M4-01), sa `phase` Prisma et sa `revision`. Le calcul
 * (plan, transitions, timers) vit dans `core`.
 */

import type { DayPhase, MeasureType, PlanEquipment } from "@brasso/core";
import type { BatchStatus, Prisma, PrismaClient } from "@brasso/db";

/** Contexte nécessaire pour démarrer une session : statut + snapshot + profil. */
export interface DayStartContext {
  status: BatchStatus;
  /** Copie figée de la recette (JSONB) — consommée par `buildDayPlan`. */
  recipeSnapshot: unknown;
  /** Champs du profil d'équipement utiles aux rampes (ou `null` si aucun profil). */
  equipment: PlanEquipment | null;
}

/** Session Jour J persistée + statut courant du batch. */
export interface DaySessionRecord {
  batchStatus: BatchStatus;
  phase: DayPhase;
  /** Instantané sérialisé (JSONB) — validé par `dayStateSchema` côté service. */
  state: unknown;
  revision: number;
}

/** Données d'initialisation d'une session (le service a construit `state`). */
export interface DaySessionCreateData {
  phase: DayPhase;
  state: Prisma.InputJsonValue;
  revision: number;
}

/** Effet `RECORD_MEASUREMENT` : une mesure append-only (`BatchMeasure`). */
export interface MeasureEffect {
  type: MeasureType;
  value: number;
  /** Phase Jour J courante (Prisma `DayPhase`, en chaîne). */
  phase: string;
  loggedById: string | null;
  loggedAt: Date;
}

/** Effet `FORCE_STEP` : une entrée de journal d'écart (`DeviationLog`). */
export interface DeviationEffect {
  step: string;
  phase: DayPhase | null;
  reason: string;
  authorId: string | null;
  /** Statut de l'étape (StepStatus core) au moment du forçage. */
  forcedFromStatus: string;
  /** Horodatage métier (`event.at`). */
  occurredAt: Date;
}

/** Instantané + effets à persister après une transition acceptée. */
export interface DayTransitionData {
  phase: DayPhase;
  state: Prisma.InputJsonValue;
  revision: number;
  /** Brassin terminé → batch `EN_FERMENTATION` (+ `fermentedAt`). */
  finished: boolean;
  measure?: MeasureEffect;
  deviation?: DeviationEffect;
}

export interface DayRepository {
  /** Contexte de démarrage d'un batch ; `null` si le batch n'existe pas. */
  getStartContext(batchId: string): Promise<DayStartContext | null>;
  /** Session Jour J existante (+ statut batch) ; `null` si aucune session. */
  getSession(batchId: string): Promise<DaySessionRecord | null>;
  /**
   * Crée la `BatchDayState` et, si le batch est encore `PLANIFIE`, le passe
   * `EN_BRASSAGE` (+ `brewedAt`) — **atomique**. `fromStatus` évite une transition
   * inutile quand le batch est déjà `EN_BRASSAGE`.
   */
  start(batchId: string, data: DaySessionCreateData, fromStatus: BatchStatus): Promise<void>;
  /**
   * Persiste une transition acceptée — **atomique** : met à jour l'instantané
   * (`state`/`revision`/`phase`), insère les effets (mesure, écart) et clôt le
   * brassin (`EN_FERMENTATION`) si `finished`.
   */
  applyEvent(batchId: string, data: DayTransitionData): Promise<void>;
}

export class PrismaBatchDayRepository implements DayRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getStartContext(batchId: string): Promise<DayStartContext | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        status: true,
        recipeSnapshot: true,
        equipmentProfile: { select: { heatingPowerKw: true, thermalMassKjPerC: true } },
      },
    });
    if (!batch) return null;
    return {
      status: batch.status,
      recipeSnapshot: batch.recipeSnapshot,
      equipment: batch.equipmentProfile
        ? {
            heatingPowerKw: batch.equipmentProfile.heatingPowerKw,
            thermalMassKjPerC: batch.equipmentProfile.thermalMassKjPerC,
          }
        : null,
    };
  }

  async getSession(batchId: string): Promise<DaySessionRecord | null> {
    const row = await this.prisma.batchDayState.findUnique({
      where: { batchId },
      select: { phase: true, state: true, revision: true, batch: { select: { status: true } } },
    });
    if (!row) return null;
    return {
      batchStatus: row.batch.status,
      phase: row.phase,
      state: row.state,
      revision: row.revision,
    };
  }

  async start(batchId: string, data: DaySessionCreateData, fromStatus: BatchStatus): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.batchDayState.create({
        data: { batchId, phase: data.phase, state: data.state, revision: data.revision },
      });
      if (fromStatus === "PLANIFIE") {
        await tx.batch.update({
          where: { id: batchId },
          data: { status: "EN_BRASSAGE", brewedAt: new Date() },
        });
      }
    });
  }

  async applyEvent(batchId: string, data: DayTransitionData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.batchDayState.update({
        where: { batchId },
        data: { phase: data.phase, state: data.state, revision: data.revision },
      });
      if (data.measure) {
        await tx.batchMeasure.create({
          data: {
            batchId,
            type: data.measure.type,
            value: data.measure.value,
            phase: data.measure.phase,
            loggedById: data.measure.loggedById,
            loggedAt: data.measure.loggedAt,
          },
        });
      }
      if (data.deviation) {
        await tx.deviationLog.create({
          data: {
            batchId,
            step: data.deviation.step,
            phase: data.deviation.phase,
            reason: data.deviation.reason,
            authorId: data.deviation.authorId,
            forcedFromStatus: data.deviation.forcedFromStatus,
            occurredAt: data.deviation.occurredAt,
          },
        });
      }
      if (data.finished) {
        await tx.batch.update({
          where: { id: batchId },
          data: { status: "EN_FERMENTATION", fermentedAt: new Date() },
        });
      }
    });
  }
}
