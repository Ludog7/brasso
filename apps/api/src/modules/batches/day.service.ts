/**
 * Service de la **session Jour J** (M4-04, ADR-08) — première brique du pilotage
 * tablette : instancier l'état à partir du plan dérivé (M4-01) et l'exposer.
 *
 * Le **serveur est la source de vérité** : il construit le `DayPlan` depuis le
 * `recipeSnapshot` figé, initialise l'état (`initDayState`, M1-13), le persiste et
 * fournit lui-même `now` pour les timings. Transitions, corrections et rejeu
 * offline sont hors périmètre (M4-05/06/07).
 */

import type {
  BatchStatus,
  DayEvent,
  DayPhase,
  DayPlan,
  DayState,
  DeviationLog,
  MeasurementKind,
  MeasureType,
  StepTiming,
} from "@brasso/core";
import {
  buildDayPlan,
  currentStep,
  dayStateSchema,
  initDayState,
  isFinished,
  phaseToDayPhase,
  stepTiming,
  transition,
} from "@brasso/core";
import type { Prisma } from "@brasso/db";

import type {
  DayEventLogEntry,
  DayRepository,
  DaySessionRecord,
  DeviationEffect,
  MeasureEffect,
} from "./day.repository.js";
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

/** Événement refusé par la machine (`transition`) : état **inchangé** → 409. */
export class DayEventRejectedError extends Error {
  readonly statusCode = 409;
  readonly code = "DAY_EVENT_REJECTED";
  constructor(reason: string) {
    super(reason);
    this.name = "DayEventRejectedError";
  }
}

/** Mesure Jour J → type de mesure batch (`BatchMeasure.type`). */
const KIND_TO_MEASURE: Record<MeasurementKind, MeasureType> = {
  density: "GRAVITY",
  temperature: "TEMPERATURE",
  volume: "VOLUME",
  ph: "PH",
};

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

/** Vue après application d'un événement — la session + l'éventuel écart produit. */
export interface DayEventView extends DaySessionView {
  /** Intention de log d'écart produite par `FORCE_STEP` (persistée). */
  deviation?: DeviationLog;
}

/** Un événement de la file offline : identifiant client (idempotence) + événement. */
export interface SyncEventInput {
  clientEventId: string;
  event: DayEvent;
}

/** Sort d'un événement rejoué : appliqué, ignoré (déjà vu), ou refusé par la machine. */
export interface SyncEventResult {
  clientEventId: string;
  outcome: "applied" | "skipped" | "rejected";
  rejection?: string;
}

/** Vue après synchro d'une file : la session résultante + le sort de chaque événement. */
export interface DaySyncView extends DaySessionView {
  results: SyncEventResult[];
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

  /**
   * Applique un `DayEvent` (cœur du Jour J, ADR-08) : recharge l'état, exécute la
   * machine pure `transition` (M1-13). Rejet → 409, **état inchangé**. Sinon
   * persiste le nouvel état (`revision + 1`), la `phase`, les effets
   * (`RECORD_MEASUREMENT` → `BatchMeasure`, `FORCE_STEP` → `DeviationLog`) et clôt
   * le brassin (`EN_FERMENTATION`) en fin de parcours — le tout en transaction.
   */
  async applyEvent(batchId: string, event: DayEvent, userId: string | null): Promise<DayEventView> {
    const session = await this.repo.getSession(batchId);
    if (!session) {
      throw new DaySessionNotFoundError(batchId);
    }
    const state = dayStateSchema.parse(session.state) as DayState;

    const result = transition(state, event);
    if (result.rejection !== undefined) {
      throw new DayEventRejectedError(result.rejection);
    }

    const newState = result.state;
    const finished = isFinished(newState);
    const phase = phaseToDayPhase(currentStep(newState)?.phase ?? null);
    const revision = session.revision + 1;

    await this.repo.applyEvent(batchId, {
      phase,
      state: serialize(newState),
      revision,
      finished,
      measure: measureEffect(event, phase, userId),
      deviation: deviationEffect(result.deviation, userId),
    });

    const batchStatus: BatchStatus = finished ? "EN_FERMENTATION" : session.batchStatus;
    return {
      batchStatus,
      phase,
      revision,
      plan: newState.plan,
      state: newState,
      timings: stepTiming(newState, this.now()),
      ...(result.deviation ? { deviation: result.deviation } : {}),
    };
  }

  /**
   * Rejoue une **file d'événements offline** (M4-06, critère de démo « wifi coupé
   * sans perte »). Les événements sont appliqués **dans l'ordre** (tri par `at`) et
   * de façon **idempotente** : un `clientEventId` déjà journalisé est ignoré (aucune
   * ré-application). Un rejet en milieu de file **n'interrompt pas** les suivants.
   * L'état final est persisté une fois, en transaction (ADR-08).
   */
  async sync(
    batchId: string,
    events: readonly SyncEventInput[],
    userId: string | null,
  ): Promise<DaySyncView> {
    const session = await this.repo.getSession(batchId);
    if (!session) {
      throw new DaySessionNotFoundError(batchId);
    }

    // Ordre déterministe par horodatage capté hors-ligne (déterminisme M1-13).
    const ordered = [...events].sort((a, b) => a.event.at - b.event.at);
    const known = await this.repo.findEventLogs(
      batchId,
      ordered.map((e) => e.clientEventId),
    );

    let state = dayStateSchema.parse(session.state) as DayState;
    let revision = session.revision;
    let changed = false;
    const measures: MeasureEffect[] = [];
    const deviations: DeviationEffect[] = [];
    const eventLogs: DayEventLogEntry[] = [];
    const results: SyncEventResult[] = [];
    const seen = new Set<string>();

    for (const { clientEventId, event } of ordered) {
      const prior = known.get(clientEventId);
      if (prior || seen.has(clientEventId)) {
        // Déjà appliqué (ou doublon dans la même file) → aucun effet, résultat mémorisé.
        results.push({
          clientEventId,
          outcome: "skipped",
          ...(prior?.rejection ? { rejection: prior.rejection } : {}),
        });
        continue;
      }
      seen.add(clientEventId);

      const result = transition(state, event);
      if (result.rejection !== undefined) {
        eventLogs.push({
          clientEventId,
          type: event.type,
          resultRevision: revision,
          rejected: true,
          rejection: result.rejection,
        });
        results.push({ clientEventId, outcome: "rejected", rejection: result.rejection });
        continue;
      }

      state = result.state;
      revision += 1;
      changed = true;
      const phaseNow = phaseToDayPhase(currentStep(state)?.phase ?? null);
      const measure = measureEffect(event, phaseNow, userId);
      if (measure) measures.push(measure);
      const deviation = deviationEffect(result.deviation, userId);
      if (deviation) deviations.push(deviation);
      eventLogs.push({
        clientEventId,
        type: event.type,
        resultRevision: revision,
        rejected: false,
        rejection: null,
      });
      results.push({ clientEventId, outcome: "applied" });
    }

    const finished = changed && isFinished(state);
    const phase = phaseToDayPhase(currentStep(state)?.phase ?? null);

    await this.repo.commitSync(batchId, {
      changed,
      phase,
      state: serialize(state),
      revision,
      finished,
      measures,
      deviations,
      eventLogs,
    });

    const batchStatus: BatchStatus = finished ? "EN_FERMENTATION" : session.batchStatus;
    return {
      batchStatus,
      phase,
      revision,
      plan: state.plan,
      state,
      timings: stepTiming(state, this.now()),
      results,
    };
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

/** Effet mesure d'un `RECORD_MEASUREMENT` (sinon `undefined`) — phase courante. */
function measureEffect(
  event: DayEvent,
  phase: DayPhase,
  userId: string | null,
): MeasureEffect | undefined {
  if (event.type !== "RECORD_MEASUREMENT") return undefined;
  return {
    type: KIND_TO_MEASURE[event.kind],
    value: event.value,
    phase,
    loggedById: userId,
    loggedAt: new Date(event.at),
  };
}

/** Effet écart d'un `FORCE_STEP` (depuis l'intention core), sinon `undefined`. */
function deviationEffect(
  deviation: DeviationLog | undefined,
  userId: string | null,
): DeviationEffect | undefined {
  if (!deviation) return undefined;
  return {
    step: deviation.stepId,
    phase: phaseToDayPhase(deviation.phase),
    reason: deviation.reason,
    authorId: userId,
    forcedFromStatus: deviation.forcedFromStatus,
    occurredAt: new Date(deviation.at),
  };
}

/** Sérialise l'instantané core vers une valeur JSON persistable (JSONB). */
function serialize(state: DayState): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
}
