import { describe, expect, it } from "vitest";

import { initDayState, transition } from "../../src/stateMachine/machine.js";
import {
  isTimerElapsed,
  stepTiming,
  timerElapsedMin,
  timerRemainingMin,
} from "../../src/stateMachine/timers.js";
import type { DayPlan, TimerState } from "../../src/stateMachine/types.js";

const MIN = 60_000;
const timer: TimerState = { stepId: "mash", startedAt: 1_000_000, plannedHoldMin: 60 };

describe("timerElapsedMin — écoulé depuis l'armement", () => {
  it("30 min après l'armement → 30", () => {
    expect(timerElapsedMin(timer, timer.startedAt + 30 * MIN)).toBe(30);
  });

  it("borne à 0 si `now` précède l'armement (horloges désynchronisées)", () => {
    expect(timerElapsedMin(timer, timer.startedAt - 10 * MIN)).toBe(0);
  });
});

describe("timerRemainingMin — restant borné à ≥ 0", () => {
  it("30 min écoulées sur 60 → 30 restants", () => {
    expect(timerRemainingMin(timer, timer.startedAt + 30 * MIN)).toBe(30);
  });

  it("dépassement → 0 (jamais négatif)", () => {
    expect(timerRemainingMin(timer, timer.startedAt + 90 * MIN)).toBe(0);
  });
});

describe("isTimerElapsed — palier planifié atteint", () => {
  it("faux avant l'échéance, vrai à/au-delà", () => {
    expect(isTimerElapsed(timer, timer.startedAt + 59 * MIN)).toBe(false);
    expect(isTimerElapsed(timer, timer.startedAt + 60 * MIN)).toBe(true);
    expect(isTimerElapsed(timer, timer.startedAt + 75 * MIN)).toBe(true);
  });
});

describe("stepTiming — estimé vs réel (montée + palier)", () => {
  const plan: DayPlan = [
    {
      id: "mash",
      phase: "MASH",
      requiresStabilization: true,
      plannedHoldMin: 60,
      plannedRampMin: 15,
    },
    { id: "boil", phase: "BOIL", requiresStabilization: false },
  ];

  it("brassin terminé → null", () => {
    const done = { ...initDayState(plan), cursor: plan.length };
    expect(stepTiming(done, 0)).toBeNull();
  });

  it("avant démarrage : ramp planifié connu, réel/palier null", () => {
    const t = stepTiming(initDayState(plan), 0);
    expect(t?.plannedRampMin).toBe(15);
    expect(t?.actualRampMin).toBeNull();
    expect(t?.plannedHoldMin).toBe(60); // depuis le spec, timer pas encore armé
    expect(t?.elapsedHoldMin).toBeNull();
    expect(t?.holdRemainingMin).toBeNull();
    expect(t?.holdOverrunMin).toBe(0);
    expect(t?.holdElapsed).toBe(false);
  });

  it("après stabilisation : montée réelle mesurée + palier en cours", () => {
    let s = initDayState(plan);
    s = transition(s, { type: "START_STEP", at: 0 }).state;
    // stabilisation 10 min après le démarrage
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 10 * MIN }).state;
    const t = stepTiming(s, 10 * MIN + 20 * MIN);
    expect(t?.actualRampMin).toBe(10); // 10 min de montée réelle
    expect(t?.plannedRampMin).toBe(15);
    expect(t?.elapsedHoldMin).toBe(20);
    expect(t?.holdRemainingMin).toBe(40);
    expect(t?.holdElapsed).toBe(false);
  });

  it("palier dépassé : overrun > 0, restant 0", () => {
    let s = initDayState(plan);
    s = transition(s, { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 0 }).state;
    const t = stepTiming(s, 75 * MIN);
    expect(t?.holdOverrunMin).toBe(15);
    expect(t?.holdRemainingMin).toBe(0);
    expect(t?.holdElapsed).toBe(true);
  });

  it("étape sans ramp/hold : champs planifiés à null", () => {
    let s = initDayState(plan);
    // avance jusqu'à `boil` (sans ramp/hold) en forçant l'empâtage
    s = transition(s, { type: "FORCE_STEP", at: 0, author: "u", reason: "skip" }).state;
    const t = stepTiming(s, 0);
    expect(t?.stepId).toBe("boil");
    expect(t?.plannedRampMin).toBeNull();
    expect(t?.plannedHoldMin).toBeNull();
  });
});
