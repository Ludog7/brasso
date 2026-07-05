/**
 * State Machine « Jour J » — cœur pur : `(state, event) → TransitionResult`.
 *
 * Déterministe (ADR-08) : mêmes `(state, event)` → même résultat, aucune lecture
 * d'horloge (le temps vient de `event.at`). Le **timer de palier est sanctuarisé**
 * (ne s'arme qu'après `CONFIRM_STABILIZATION` quand l'étape l'exige) et « Forcer
 * l'étape » produit une intention de {@link DeviationLog}. Pur (ADR-03).
 */

import { isTimerElapsed } from "./timers.js";
import type {
  DayEvent,
  DayPlan,
  DayState,
  DeviationLog,
  Measurement,
  MeasurementKind,
  StepSpec,
  TransitionResult,
} from "./types.js";

/** Crée l'état initial d'un Jour J à partir d'un plan (curseur sur la 1re étape). */
export function initDayState(plan: DayPlan): DayState {
  return {
    plan,
    cursor: 0,
    status: plan.length === 0 ? "COMPLETED" : "PENDING",
    stepStartedAt: null,
    stabilizedAt: null,
    timer: null,
    measurements: [],
    completedStepIds: [],
  };
}

/** Le brassin est-il terminé (plus d'étape courante) ? */
export function isFinished(state: DayState): boolean {
  return state.cursor >= state.plan.length;
}

/** Étape courante, ou `null` si le brassin est terminé (curseur hors plan). */
export function currentStep(state: DayState): StepSpec | null {
  return state.plan[state.cursor] ?? null;
}

/** Mesures saisies pendant une étape donnée. */
export function measurementsForStep(state: DayState, stepId: string): readonly Measurement[] {
  return state.measurements.filter((m) => m.stepId === stepId);
}

/** Kinds de mesures requises encore manquantes pour l'étape courante. */
function missingMeasurements(state: DayState, step: StepSpec): readonly MeasurementKind[] {
  const required = step.requiredMeasurements ?? [];
  const present = new Set(measurementsForStep(state, step.id).map((m) => m.kind));
  return required.filter((kind) => !present.has(kind));
}

/** Termine l'étape courante et avance le curseur (validation ou forçage). */
function completeCurrentStep(state: DayState, step: StepSpec): DayState {
  const nextCursor = state.cursor + 1;
  const finished = nextCursor >= state.plan.length;
  return {
    ...state,
    cursor: nextCursor,
    status: finished ? "COMPLETED" : "PENDING",
    stepStartedAt: null,
    stabilizedAt: null,
    timer: null,
    completedStepIds: [...state.completedStepIds, step.id],
  };
}

/** Refus : état inchangé + motif. */
function reject(state: DayState, rejection: string): TransitionResult {
  return { state, rejection };
}

/**
 * Applique un événement à l'état. Renvoie l'état suivant, l'éventuelle intention
 * de `DeviationLog` (forçage), ou un motif de refus (état inchangé).
 */
export function transition(state: DayState, event: DayEvent): TransitionResult {
  const step = currentStep(state);
  if (step === null) {
    return reject(state, "Brassin terminé : aucune étape courante.");
  }

  switch (event.type) {
    case "START_STEP": {
      if (state.status !== "PENDING") {
        return reject(state, "L'étape est déjà démarrée.");
      }
      // Palier sanctuarisé : si stabilisation requise, on attend la confirmation
      // avant d'armer le timer. Sinon un éventuel timer démarre immédiatement.
      if (step.requiresStabilization) {
        return { state: { ...state, status: "AWAITING_STABILIZATION", stepStartedAt: event.at } };
      }
      if (step.plannedHoldMin !== undefined) {
        return {
          state: {
            ...state,
            status: "TIMER_RUNNING",
            stepStartedAt: event.at,
            timer: { stepId: step.id, startedAt: event.at, plannedHoldMin: step.plannedHoldMin },
          },
        };
      }
      return { state: { ...state, status: "AWAITING_VALIDATION", stepStartedAt: event.at } };
    }

    case "CONFIRM_STABILIZATION": {
      if (state.status !== "AWAITING_STABILIZATION") {
        return reject(state, "L'étape n'attend pas de stabilisation.");
      }
      // La stabilisation confirmée arme (enfin) le timer de palier.
      const withStabilized: DayState = {
        ...state,
        stabilizedAt: event.at,
        measurements:
          event.temperatureC === undefined
            ? state.measurements
            : [
                ...state.measurements,
                {
                  kind: "temperature",
                  value: event.temperatureC,
                  at: event.at,
                  stepId: step.id,
                  source: event.source ?? "manual",
                },
              ],
      };
      if (step.plannedHoldMin !== undefined) {
        return {
          state: {
            ...withStabilized,
            status: "TIMER_RUNNING",
            timer: { stepId: step.id, startedAt: event.at, plannedHoldMin: step.plannedHoldMin },
          },
        };
      }
      return { state: { ...withStabilized, status: "AWAITING_VALIDATION" } };
    }

    case "RECORD_MEASUREMENT": {
      const measurement: Measurement = {
        kind: event.kind,
        value: event.value,
        at: event.at,
        stepId: step.id,
        source: event.source ?? "manual",
      };
      return { state: { ...state, measurements: [...state.measurements, measurement] } };
    }

    case "VALIDATE_STEP": {
      if (state.status === "PENDING" || state.status === "AWAITING_STABILIZATION") {
        return reject(
          state,
          "Étape pas prête à valider (démarrer puis confirmer la stabilisation, ou forcer).",
        );
      }
      if (state.timer !== null && !isTimerElapsed(state.timer, event.at)) {
        return reject(state, "Timer de palier non écoulé.");
      }
      const missing = missingMeasurements(state, step);
      if (missing.length > 0) {
        return reject(state, `Mesures requises manquantes : ${missing.join(", ")}.`);
      }
      return { state: completeCurrentStep(state, step) };
    }

    case "FORCE_STEP": {
      // Mode manuel : avance malgré des conditions incomplètes, depuis n'importe
      // quel statut actif, et produit l'intention de log d'écart (ADR-08).
      const deviation: DeviationLog = {
        stepId: step.id,
        phase: step.phase,
        author: event.author,
        at: event.at,
        reason: event.reason,
        forcedFromStatus: state.status,
      };
      return { state: completeCurrentStep(state, step), deviation };
    }
  }
}
