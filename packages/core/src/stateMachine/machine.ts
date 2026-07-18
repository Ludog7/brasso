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
  StepValidationCheck,
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

/**
 * Libellés des types de mesure dans les **motifs de blocage** (#266). Ces
 * motifs sont rédigés pour l'affichage (cf. {@link StepValidationCheck}) : y
 * recopier les identifiants internes (`density`, `volume`) donnait une phrase
 * française parsemée d'anglais sur l'écran d'atelier.
 *
 * Distinct des libellés d'`apps/web` (capitalisés, employés en titre de liste) :
 * ceux-ci s'insèrent en milieu de phrase.
 */
const MEASUREMENT_KIND_LABELS: Record<MeasurementKind, string> = {
  density: "densité",
  volume: "volume",
  temperature: "température",
  ph: "pH",
};

/** Kinds de mesures requises encore manquantes pour l'étape courante. */
function missingMeasurements(state: DayState, step: StepSpec): readonly MeasurementKind[] {
  const required = step.requiredMeasurements ?? [];
  const present = new Set(measurementsForStep(state, step.id).map((m) => m.kind));
  return required.filter((kind) => !present.has(kind));
}

/**
 * Dernière température relevée sur une étape, ou `undefined`. « Dernière » au
 * sens de l'ordre d'arrivée : la machine ne trie pas sur `at`, un rejeu offline
 * pouvant livrer les mesures dans le désordre (ADR-08).
 */
function latestTemperature(state: DayState, stepId: string): number | undefined {
  let value: number | undefined;
  for (const m of state.measurements) {
    if (m.stepId === stepId && m.kind === "temperature") value = m.value;
  }
  return value;
}

/**
 * L'étape n'a-t-elle **aucune barrière temporelle** (ni palier chronométré, ni
 * stabilisation à confirmer) ? Une telle étape — filtration typiquement — ne
 * progresse que sur action explicite de l'opérateur.
 */
function hasNoTimedGate(step: StepSpec): boolean {
  return !step.requiresStabilization && step.plannedHoldMin === undefined;
}

/**
 * Peut-on valider l'étape courante **en mode normal**, à l'instant `at` ?
 *
 * Règle **unique** : {@link transition} s'appuie sur cette même fonction pour
 * `VALIDATE_STEP`. L'écran et la machine ne peuvent donc pas diverger — un
 * bouton proposé est un bouton qui aboutit.
 */
export function stepValidationCheck(state: DayState, at: number): StepValidationCheck {
  const step = currentStep(state);
  if (step === null) {
    return {
      canValidate: false,
      blockedBy: ["Brassin terminé : aucune étape courante."],
      awaitsManualValidation: false,
    };
  }

  const blockedBy: string[] = [];

  if (state.status === "PENDING") {
    blockedBy.push("Étape non démarrée.");
  } else if (state.status === "AWAITING_STABILIZATION") {
    blockedBy.push("Stabilisation à la température cible non confirmée.");
  }

  if (state.timer !== null && !isTimerElapsed(state.timer, at)) {
    blockedBy.push("Timer de palier non écoulé.");
  }

  const missing = missingMeasurements(state, step);
  if (missing.length > 0) {
    blockedBy.push(
      `Mesures requises manquantes : ${missing.map((k) => MEASUREMENT_KIND_LABELS[k]).join(", ")}.`,
    );
  }

  // Contrainte de température cible (M9-03) : n'est évaluée que si une mesure
  // existe — l'absence de relevé est déjà signalée par `requiredMeasurements`,
  // on ne veut pas deux messages pour un seul manque.
  if (step.targetTempConstraint !== undefined && step.targetTempC !== undefined) {
    const measured = latestTemperature(state, step.id);
    if (measured !== undefined) {
      const satisfied =
        step.targetTempConstraint === "at_most"
          ? measured <= step.targetTempC
          : measured >= step.targetTempC;
      if (!satisfied) {
        const sens = step.targetTempConstraint === "at_most" ? "≤" : "≥";
        blockedBy.push(
          `Température de ${measured} °C hors cible (attendu ${sens} ${step.targetTempC} °C).`,
        );
      }
    }
  }

  return {
    canValidate: blockedBy.length === 0,
    blockedBy,
    awaitsManualValidation: hasNoTimedGate(step) && state.status === "AWAITING_VALIDATION",
  };
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
      // Règle unique, partagée avec l'écran (M9-03) : ce que `stepValidationCheck`
      // annonce validable l'est réellement ici. Un refus renvoie l'état
      // **inchangé** — les mesures déjà saisies ne sont jamais perdues.
      const check = stepValidationCheck(state, event.at);
      if (!check.canValidate) {
        return reject(state, check.blockedBy.join(" "));
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
