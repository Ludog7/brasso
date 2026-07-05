/**
 * Chronométrage pur du Jour J — temps **estimé vs réel** (montée + palier).
 *
 * Aucune lecture d'horloge : l'instant courant `now` (epoch ms) est toujours
 * fourni par l'appelant, garantissant le déterminisme (ADR-08). Pur (ADR-03).
 */

import type { DayState, StepTiming, TimerState } from "./types.js";

/** Millisecondes par minute — conversion locale des durées. */
const MS_PER_MIN = 60_000;

/**
 * Temps écoulé du palier (min) depuis l'armement du timer.
 * @param timer timer armé.
 * @param now   instant courant (epoch ms) ; doit être ≥ `timer.startedAt`.
 */
export function timerElapsedMin(timer: TimerState, now: number): number {
  return Math.max(0, (now - timer.startedAt) / MS_PER_MIN);
}

/** Temps de palier restant (min, borné à ≥ 0). */
export function timerRemainingMin(timer: TimerState, now: number): number {
  return Math.max(0, timer.plannedHoldMin - timerElapsedMin(timer, now));
}

/** Le palier planifié est-il écoulé ? (dépassement inclus). */
export function isTimerElapsed(timer: TimerState, now: number): boolean {
  return timerElapsedMin(timer, now) >= timer.plannedHoldMin;
}

/**
 * Photo du chronométrage de l'étape courante à l'instant `now` — montée en
 * chauffe (ramp) et palier (hold), estimé vs réel. `null` si brassin terminé.
 */
export function stepTiming(state: DayState, now: number): StepTiming | null {
  // Étape courante inline (évite un cycle d'import avec `machine.ts`).
  const step = state.plan[state.cursor] ?? null;
  if (step === null) return null;

  const plannedRampMin = step.plannedRampMin ?? null;
  const actualRampMin =
    state.stepStartedAt !== null && state.stabilizedAt !== null
      ? Math.max(0, (state.stabilizedAt - state.stepStartedAt) / MS_PER_MIN)
      : null;

  const timer = state.timer;
  const plannedHoldMin = timer?.plannedHoldMin ?? step.plannedHoldMin ?? null;
  const elapsedHoldMin = timer ? timerElapsedMin(timer, now) : null;
  const holdRemainingMin = timer ? timerRemainingMin(timer, now) : null;
  const holdOverrunMin = timer
    ? Math.max(0, timerElapsedMin(timer, now) - timer.plannedHoldMin)
    : 0;
  const holdElapsed = timer ? isTimerElapsed(timer, now) : false;

  return {
    stepId: step.id,
    phase: step.phase,
    plannedRampMin,
    actualRampMin,
    plannedHoldMin,
    elapsedHoldMin,
    holdRemainingMin,
    holdOverrunMin,
    holdElapsed,
  };
}
