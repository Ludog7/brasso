/**
 * Service de la **session Jour J** (M4-04, ADR-08) — première brique du pilotage
 * tablette : instancier l'état à partir du plan dérivé (M4-01) et l'exposer.
 *
 * Le **serveur est la source de vérité** : il construit le `DayPlan` depuis le
 * `recipeSnapshot` figé, initialise l'état (`initDayState`, M1-13), le persiste et
 * fournit lui-même `now` pour les timings. Transitions, corrections et rejeu
 * offline sont hors périmètre (M4-05/06/07).
 */

import type { BatchStatus, DayPhase, DayPlan, DayState, StepTiming } from "@brasso/core";
import {
  buildDayPlan,
  currentStep,
  dayStateSchema,
  initDayState,
  phaseToDayPhase,
  stepTiming,
} from "@brasso/core";
import type { Prisma } from "@brasso/db";

import type { DayRepository, DaySessionRecord } from "./day.repository.js";
import { BatchNotFoundError } from "./service.js";

/** Démarrage refusé : le batch n'est pas dans un statut compatible → 409. */
export class DayNotStartableError extends Error {
  readonly statusCode = 409;
  readonly code = "DAY_NOT_STARTABLE";
  constructor(id: string, status: string) {
    super(`Le batch ${id} (${status}) ne peut pas démarrer le Jour J`);
    this.name = "DayNotStartableError";
  }
}

/** Aucune session Jour J pour ce batch → 404. */
export class DaySessionNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(id: string) {
    super(`Aucune session Jour J pour le batch ${id}`);
    this.name = "DaySessionNotFoundError";
  }
}

/** Vue exposée d'une session Jour J : plan, état, timings dérivés, phase Prisma. */
export interface DaySessionView {
  batchStatus: BatchStatus;
  /** Phase côté persistance (Prisma `DayPhase`), dérivée de l'étape courante. */
  phase: DayPhase;
  revision: number;
  plan: DayPlan;
  state: DayState;
  /** Chronométrage de l'étape courante à `now` (serveur), ou `null` si terminé. */
  timings: StepTiming | null;
}

/** Résultat de `start` : `created=false` quand la session existait déjà (idempotent). */
export interface DayStartResult {
  created: boolean;
  day: DaySessionView;
}

export class BatchDayService {
  constructor(
    private readonly repo: DayRepository,
    /** Horloge serveur (injectable pour les tests). */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Démarre le Jour J : batch `PLANIFIE`/`EN_BRASSAGE` requis (sinon 409). Dérive
   * le plan, initialise l'état, persiste et passe le batch `EN_BRASSAGE`.
   * **Idempotent** : si une session existe, renvoie l'existante sans réinitialiser.
   */
  async start(batchId: string): Promise<DayStartResult> {
    const existing = await this.repo.getSession(batchId);
    if (existing) {
      return { created: false, day: this.toView(existing) };
    }

    const ctx = await this.repo.getStartContext(batchId);
    if (!ctx) {
      throw new BatchNotFoundError(batchId);
    }
    if (ctx.status !== "PLANIFIE" && ctx.status !== "EN_BRASSAGE") {
      throw new DayNotStartableError(batchId, ctx.status);
    }

    const plan = buildDayPlan({
      recipeSnapshot: ctx.recipeSnapshot,
      equipment: ctx.equipment ?? undefined,
    });
    const state = initDayState(plan);
    const phase = phaseToDayPhase(currentStep(state)?.phase ?? null);

    await this.repo.start(batchId, { phase, state: serialize(state), revision: 0 }, ctx.status);

    const batchStatus: BatchStatus = ctx.status === "PLANIFIE" ? "EN_BRASSAGE" : ctx.status;
    return {
      created: true,
      day: { batchStatus, phase, revision: 0, plan, state, timings: stepTiming(state, this.now()) },
    };
  }

  /** Charge la session Jour J d'un batch (plan + état + timings). 404 si absente. */
  async get(batchId: string): Promise<DaySessionView> {
    const session = await this.repo.getSession(batchId);
    if (!session) {
      throw new DaySessionNotFoundError(batchId);
    }
    return this.toView(session);
  }

  /** Reconstruit la vue depuis l'instantané persisté (validé par `dayStateSchema`). */
  private toView(record: DaySessionRecord): DaySessionView {
    const state = dayStateSchema.parse(record.state) as DayState;
    return {
      batchStatus: record.batchStatus,
      phase: record.phase,
      revision: record.revision,
      plan: state.plan,
      state,
      timings: stepTiming(state, this.now()),
    };
  }
}

/** Sérialise l'instantané core vers une valeur JSON persistable (JSONB). */
function serialize(state: DayState): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
}
