/**
 * Accès aux données de la **session Jour J** d'un batch (M4-04). Interface
 * injectable (Prisma / in-memory), comme le reste du module `batches`.
 *
 * Le serveur est la source de vérité (ADR-08) : la DB porte l'instantané `state`
 * (forme `dayStateSchema`, M4-01), sa `phase` Prisma et sa `revision`. Le calcul
 * (plan, transitions, timers) vit dans `core`.
 */

import type { DayPhase, MeasureType, PlanEquipment } from "@brasso/core";
import type { BatchStatus, CorrectionType, Prisma, PrismaClient } from "@brasso/db";

import { consumeReservationsForBatch, prismaConsumePort } from "../stock/consume.js";

/** Contexte nécessaire pour démarrer une session : statut + snapshot + profil. */
export interface DayStartContext {
  status: BatchStatus;
  /** Copie figée de la recette (JSONB) — consommée par `buildDayPlan`. */
  recipeSnapshot: unknown;
  /** Champs du profil d'équipement utiles aux rampes (ou `null` si aucun profil). */
  equipment: PlanEquipment | null;
  /**
   * Délai (min avant le hors-flamme) de l'**assainissement du circuit de
   * refroidissement**, lu des `Settings` (M9-02).
   *
   * Lu ici parce que `core` n'en code aucune valeur par défaut (ADR-01) et
   * n'en dérive l'étape **que** si l'appelant le fournit. Il ne l'était pas
   * (#276) : l'étape n'apparaissait dans aucun Jour J, emportant avec elle sa
   * consigne d'écran et son disclaimer ADR-11.
   */
  coolingCircuitSanitizeLeadMin: number;
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

/**
 * Écart de procédure persisté (`DeviationLog`) tel que lu pour le **journal**
 * (M4-12) : identifiant, étape/phase, motif, **nom** de l'auteur (résolu via la
 * relation, `null` si l'utilisateur a été supprimé) et horodatage métier.
 */
export interface DeviationRecord {
  id: string;
  step: string;
  phase: DayPhase | null;
  reason: string;
  /** Nom affichable de l'auteur du forçage (`null` si compte supprimé). */
  authorName: string | null;
  forcedFromStatus: string | null;
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
  /** Auteur de la clôture — pose les mouvements `PRODUCTION` de consommation (M5-05). */
  actorId: string | null;
}

/** Entrée déjà rejouée (`DayEventLog`) — sert de garde d'idempotence (M4-06). */
export interface DayEventLogRecord {
  clientEventId: string;
  rejected: boolean;
  rejection: string | null;
  resultRevision: number;
}

/** Nouvelle ligne `DayEventLog` à écrire lors d'une synchro. */
export interface DayEventLogEntry {
  clientEventId: string;
  type: string;
  resultRevision: number;
  rejected: boolean;
  rejection: string | null;
}

/**
 * Résultat consolidé d'une synchro (M4-06) à persister **atomiquement** : l'état
 * final (si au moins un événement a été appliqué), les effets cumulés et les
 * lignes d'idempotence de tous les nouveaux événements (appliqués **ou** rejetés).
 */
export interface DaySyncCommit {
  /** `true` si au moins un événement a été appliqué (état/revision ont changé). */
  changed: boolean;
  phase: DayPhase;
  state: Prisma.InputJsonValue;
  revision: number;
  /** `true` si le brassin vient d'être terminé par cette synchro. */
  finished: boolean;
  measures: MeasureEffect[];
  deviations: DeviationEffect[];
  eventLogs: DayEventLogEntry[];
  /** Auteur de la clôture — pose les mouvements `PRODUCTION` de consommation (M5-05). */
  actorId: string | null;
}

/**
 * Contexte nécessaire aux **corrections densité pré-ébullition** (M4-07) : la
 * copie figée de la recette (pour reconstituer les cibles) et le taux
 * d'évaporation du profil d'équipement (ou `null` si aucun profil).
 */
export interface CorrectionContext {
  /** Copie figée de la recette (JSONB) — cibles reconstituées côté service. */
  recipeSnapshot: unknown;
  /** Taux d'évaporation à l'ébullition (L/h) du profil, ou `null` si aucun profil. */
  evaporationRateLPerHour: number | null;
}

/**
 * Décision de correction à journaliser (`BatchCorrectionLog`, M4-03) — append-only.
 * La correction est une **trace de décision**, sans impact sur la state machine.
 */
export interface CorrectionLogEntry {
  /** Identifiant de l'étape du plan concernée (ex. `boil-1`). */
  stepId: string;
  type: CorrectionType;
  /** Proposition retenue (chiffres OG/ABV…), stockée telle quelle en JSONB. */
  payload: Prisma.InputJsonValue;
  authorId: string | null;
}

/** Ligne `BatchCorrectionLog` telle que relue après insertion (pour la réponse). */
export interface CorrectionLogRecord {
  id: string;
  stepId: string;
  type: CorrectionType;
  payload: unknown;
  authorId: string | null;
  createdAt: Date;
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
  /** Événements de la file déjà appliqués (par `clientEventId`) — garde d'idempotence. */
  findEventLogs(batchId: string, clientEventIds: string[]): Promise<Map<string, DayEventLogRecord>>;
  /** Persiste le résultat d'une synchro (état + effets + journal) — **atomique**. */
  commitSync(batchId: string, commit: DaySyncCommit): Promise<void>;
  /** Écarts de procédure du batch (journal M4-12), du plus ancien au plus récent. */
  listDeviations(batchId: string): Promise<DeviationRecord[]>;
  /**
   * Contexte de correction densité (M4-07) : snapshot + évaporation du profil ;
   * `null` si le batch n'existe pas. Sert de garde d'existence pour la
   * journalisation comme pour l'aperçu.
   */
  getCorrectionContext(batchId: string): Promise<CorrectionContext | null>;
  /** Journalise une décision de correction (`BatchCorrectionLog`) — append-only. */
  logCorrection(batchId: string, entry: CorrectionLogEntry): Promise<CorrectionLogRecord>;
}

export class PrismaBatchDayRepository implements DayRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getStartContext(batchId: string): Promise<DayStartContext | null> {
    const [batch, settings] = await Promise.all([
      this.prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          status: true,
          recipeSnapshot: true,
          equipmentProfile: { select: { heatingPowerKw: true, thermalMassKjPerC: true } },
        },
      }),
      this.prisma.settings.findFirst({ select: { coolingCircuitSanitizeLeadMin: true } }),
    ]);
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
      // Même valeur que le `@default` du schéma : une instance sans ligne
      // `Settings` garde son étape d'assainissement plutôt que de la perdre en
      // silence — c'est une étape de sécurité alimentaire.
      coolingCircuitSanitizeLeadMin: settings?.coolingCircuitSanitizeLeadMin ?? 5,
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
        // Ensemencement par clôture Jour J : consommation dans la même transaction
        // (M5-05, idempotente vis-à-vis d'un éventuel changeStatus antérieur).
        await consumeReservationsForBatch(prismaConsumePort(tx), batchId, data.actorId);
      }
    });
  }

  async findEventLogs(
    batchId: string,
    clientEventIds: string[],
  ): Promise<Map<string, DayEventLogRecord>> {
    if (clientEventIds.length === 0) return new Map();
    const rows = await this.prisma.dayEventLog.findMany({
      where: { batchId, id: { in: clientEventIds } },
      select: { id: true, rejected: true, rejection: true, resultRevision: true },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        {
          clientEventId: r.id,
          rejected: r.rejected,
          rejection: r.rejection,
          resultRevision: r.resultRevision,
        },
      ]),
    );
  }

  async commitSync(batchId: string, commit: DaySyncCommit): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (commit.changed) {
        await tx.batchDayState.update({
          where: { batchId },
          data: { phase: commit.phase, state: commit.state, revision: commit.revision },
        });
        for (const m of commit.measures) {
          await tx.batchMeasure.create({
            data: {
              batchId,
              type: m.type,
              value: m.value,
              phase: m.phase,
              loggedById: m.loggedById,
              loggedAt: m.loggedAt,
            },
          });
        }
        for (const d of commit.deviations) {
          await tx.deviationLog.create({
            data: {
              batchId,
              step: d.step,
              phase: d.phase,
              reason: d.reason,
              authorId: d.authorId,
              forcedFromStatus: d.forcedFromStatus,
              occurredAt: d.occurredAt,
            },
          });
        }
        if (commit.finished) {
          await tx.batch.update({
            where: { id: batchId },
            data: { status: "EN_FERMENTATION", fermentedAt: new Date() },
          });
          // Ensemencement par clôture via rejeu offline : consommation atomique (M5-05).
          await consumeReservationsForBatch(prismaConsumePort(tx), batchId, commit.actorId);
        }
      }
      if (commit.eventLogs.length > 0) {
        await tx.dayEventLog.createMany({
          data: commit.eventLogs.map((e) => ({
            id: e.clientEventId,
            batchId,
            type: e.type,
            resultRevision: e.resultRevision,
            rejected: e.rejected,
            rejection: e.rejection,
          })),
        });
      }
    });
  }

  async listDeviations(batchId: string): Promise<DeviationRecord[]> {
    const rows = await this.prisma.deviationLog.findMany({
      where: { batchId },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        step: true,
        phase: true,
        reason: true,
        forcedFromStatus: true,
        occurredAt: true,
        author: { select: { displayName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      step: r.step,
      phase: r.phase,
      reason: r.reason,
      forcedFromStatus: r.forcedFromStatus,
      authorName: r.author?.displayName ?? null,
      occurredAt: r.occurredAt,
    }));
  }

  async getCorrectionContext(batchId: string): Promise<CorrectionContext | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        recipeSnapshot: true,
        equipmentProfile: { select: { evaporationRateLPerHour: true } },
      },
    });
    if (!batch) return null;
    return {
      recipeSnapshot: batch.recipeSnapshot,
      evaporationRateLPerHour: batch.equipmentProfile?.evaporationRateLPerHour ?? null,
    };
  }

  async logCorrection(batchId: string, entry: CorrectionLogEntry): Promise<CorrectionLogRecord> {
    return this.prisma.batchCorrectionLog.create({
      data: {
        batchId,
        stepId: entry.stepId,
        type: entry.type,
        payload: entry.payload,
        authorId: entry.authorId,
      },
      select: {
        id: true,
        stepId: true,
        type: true,
        payload: true,
        authorId: true,
        createdAt: true,
      },
    });
  }
}
