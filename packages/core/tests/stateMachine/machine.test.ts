import { describe, expect, it } from "vitest";

import {
  currentStep,
  initDayState,
  isFinished,
  measurementsForStep,
  transition,
} from "../../src/stateMachine/machine.js";
import { defaultDayPlan } from "../../src/stateMachine/plan.js";
import type { DayPlan, DayState } from "../../src/stateMachine/types.js";

const MIN = 60_000;

/** Applique une suite d'événements en asseyant l'absence de refus. */
function drive(state: DayState, events: Parameters<typeof transition>[1][]): DayState {
  return events.reduce((s, ev) => {
    const res = transition(s, ev);
    expect(res.rejection).toBeUndefined();
    return res.state;
  }, state);
}

describe("initDayState — état initial", () => {
  it("curseur sur la 1re étape, statut PENDING, rien d'armé", () => {
    const s = initDayState(defaultDayPlan());
    expect(s.cursor).toBe(0);
    expect(s.status).toBe("PENDING");
    expect(s.timer).toBeNull();
    expect(s.stepStartedAt).toBeNull();
    expect(s.stabilizedAt).toBeNull();
    expect(s.measurements).toEqual([]);
    expect(s.completedStepIds).toEqual([]);
    expect(isFinished(s)).toBe(false);
    expect(currentStep(s)?.phase).toBe("INITIALIZATION");
  });

  it("plan vide → terminé d'emblée (COMPLETED, currentStep null)", () => {
    const s = initDayState([]);
    expect(s.status).toBe("COMPLETED");
    expect(isFinished(s)).toBe(true);
    expect(currentStep(s)).toBeNull();
  });
});

describe("transition — garde générale", () => {
  it("refuse tout événement quand le brassin est terminé", () => {
    const s = { ...initDayState([]), cursor: 0 };
    const res = transition(s, { type: "START_STEP", at: 0 });
    expect(res.state).toBe(s);
    expect(res.rejection).toContain("terminé");
  });
});

describe("START_STEP", () => {
  it("étape à stabilisation → AWAITING_STABILIZATION, timer NON armé (sanctuarisé)", () => {
    const plan: DayPlan = [
      { id: "mash", phase: "MASH", requiresStabilization: true, plannedHoldMin: 60 },
    ];
    const res = transition(initDayState(plan), { type: "START_STEP", at: 1000 });
    expect(res.state.status).toBe("AWAITING_STABILIZATION");
    expect(res.state.timer).toBeNull();
    expect(res.state.stepStartedAt).toBe(1000);
  });

  it("étape sans stabilisation mais avec palier → timer armé immédiatement", () => {
    const plan: DayPlan = [
      { id: "rest", phase: "MASH", requiresStabilization: false, plannedHoldMin: 20 },
    ];
    const res = transition(initDayState(plan), { type: "START_STEP", at: 500 });
    expect(res.state.status).toBe("TIMER_RUNNING");
    expect(res.state.timer).toEqual({ stepId: "rest", startedAt: 500, plannedHoldMin: 20 });
  });

  it("étape simple (ni stabilisation ni palier) → AWAITING_VALIDATION", () => {
    const plan: DayPlan = [{ id: "init", phase: "INITIALIZATION", requiresStabilization: false }];
    const res = transition(initDayState(plan), { type: "START_STEP", at: 0 });
    expect(res.state.status).toBe("AWAITING_VALIDATION");
    expect(res.state.timer).toBeNull();
  });

  it("refuse un second démarrage", () => {
    const plan: DayPlan = [{ id: "init", phase: "INITIALIZATION", requiresStabilization: false }];
    const started = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    const res = transition(started, { type: "START_STEP", at: 1 });
    expect(res.rejection).toContain("déjà démarrée");
    expect(res.state).toBe(started);
  });
});

describe("CONFIRM_STABILIZATION — arme le timer sanctuarisé", () => {
  const plan: DayPlan = [
    { id: "mash", phase: "MASH", requiresStabilization: true, plannedHoldMin: 60 },
  ];

  it("depuis AWAITING_STABILIZATION → arme le timer à l'instant de confirmation", () => {
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 5 * MIN }).state;
    expect(s.status).toBe("TIMER_RUNNING");
    expect(s.timer).toEqual({ stepId: "mash", startedAt: 5 * MIN, plannedHoldMin: 60 });
    expect(s.stabilizedAt).toBe(5 * MIN);
  });

  it("enregistre la température si fournie (source par défaut = manual)", () => {
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 0, temperatureC: 66 }).state;
    expect(measurementsForStep(s, "mash")).toEqual([
      { kind: "temperature", value: 66, at: 0, stepId: "mash", source: "manual" },
    ]);
  });

  it("propage la source sonde (point d'extension IoT)", () => {
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    s = transition(s, {
      type: "CONFIRM_STABILIZATION",
      at: 0,
      temperatureC: 66,
      source: "sensor",
    }).state;
    expect(measurementsForStep(s, "mash")[0]?.source).toBe("sensor");
  });

  it("sans température → aucune mesure ajoutée", () => {
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 0 }).state;
    expect(s.measurements).toEqual([]);
  });

  it("étape à stabilisation sans palier → AWAITING_VALIDATION (pas de timer)", () => {
    const noHold: DayPlan = [{ id: "cool", phase: "COOLING", requiresStabilization: true }];
    let s = transition(initDayState(noHold), { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 10 }).state;
    expect(s.status).toBe("AWAITING_VALIDATION");
    expect(s.timer).toBeNull();
    expect(s.stabilizedAt).toBe(10);
  });

  it("refuse hors AWAITING_STABILIZATION", () => {
    const res = transition(initDayState(plan), { type: "CONFIRM_STABILIZATION", at: 0 });
    expect(res.rejection).toContain("n'attend pas");
  });
});

describe("RECORD_MEASUREMENT", () => {
  const plan: DayPlan = [{ id: "lauter", phase: "LAUTER", requiresStabilization: false }];

  it("empile la mesure horodatée sur l'étape courante (source défaut manual)", () => {
    let s = initDayState(plan);
    s = transition(s, { type: "RECORD_MEASUREMENT", at: 42, kind: "density", value: 1.048 }).state;
    expect(s.measurements).toEqual([
      { kind: "density", value: 1.048, at: 42, stepId: "lauter", source: "manual" },
    ]);
    expect(s.status).toBe("PENDING"); // ne change pas le statut
  });

  it("propage la source sonde", () => {
    let s = initDayState(plan);
    s = transition(s, {
      type: "RECORD_MEASUREMENT",
      at: 1,
      kind: "volume",
      value: 25,
      source: "sensor",
    }).state;
    expect(s.measurements[0]?.source).toBe("sensor");
  });
});

describe("VALIDATE_STEP — mode normal (conditions vérifiées)", () => {
  it("refuse si étape pas démarrée (PENDING)", () => {
    const plan: DayPlan = [{ id: "init", phase: "INITIALIZATION", requiresStabilization: false }];
    const res = transition(initDayState(plan), { type: "VALIDATE_STEP", at: 0 });
    expect(res.rejection).toContain("pas prête");
  });

  it("refuse depuis AWAITING_STABILIZATION (stabilisation obligatoire d'abord)", () => {
    const plan: DayPlan = [{ id: "mash", phase: "MASH", requiresStabilization: true }];
    const s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    const res = transition(s, { type: "VALIDATE_STEP", at: 0 });
    expect(res.rejection).toContain("pas prête");
  });

  it("refuse tant que le timer de palier n'est pas écoulé", () => {
    const plan: DayPlan = [
      { id: "mash", phase: "MASH", requiresStabilization: true, plannedHoldMin: 60 },
    ];
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "CONFIRM_STABILIZATION", at: 0 }).state;
    const early = transition(s, { type: "VALIDATE_STEP", at: 30 * MIN });
    expect(early.rejection).toContain("non écoulé");
    const done = transition(s, { type: "VALIDATE_STEP", at: 60 * MIN });
    expect(done.rejection).toBeUndefined();
    expect(isFinished(done.state)).toBe(true);
  });

  it("refuse si des mesures requises manquent, puis accepte une fois saisies", () => {
    const plan: DayPlan = [
      {
        id: "lauter",
        phase: "LAUTER",
        requiresStabilization: false,
        requiredMeasurements: ["density", "volume"],
      },
    ];
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    const missing = transition(s, { type: "VALIDATE_STEP", at: 0 });
    expect(missing.rejection).toContain("density, volume");

    s = transition(s, { type: "RECORD_MEASUREMENT", at: 0, kind: "density", value: 1.05 }).state;
    const stillMissing = transition(s, { type: "VALIDATE_STEP", at: 0 });
    expect(stillMissing.rejection).toContain("volume");

    s = transition(s, { type: "RECORD_MEASUREMENT", at: 0, kind: "volume", value: 25 }).state;
    const ok = transition(s, { type: "VALIDATE_STEP", at: 0 });
    expect(ok.rejection).toBeUndefined();
    expect(ok.state.completedStepIds).toEqual(["lauter"]);
  });

  it("valide une étape simple et avance le curseur (statut PENDING sur la suivante)", () => {
    const plan: DayPlan = [
      { id: "init", phase: "INITIALIZATION", requiresStabilization: false },
      { id: "pitch", phase: "PITCHING", requiresStabilization: false },
    ];
    let s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    s = transition(s, { type: "VALIDATE_STEP", at: 0 }).state;
    expect(s.cursor).toBe(1);
    expect(s.status).toBe("PENDING");
    expect(s.timer).toBeNull();
    expect(s.stepStartedAt).toBeNull();
    expect(currentStep(s)?.id).toBe("pitch");
  });
});

describe("FORCE_STEP — mode manuel → intention de DeviationLog", () => {
  const plan: DayPlan = [
    { id: "mash", phase: "MASH", requiresStabilization: true, plannedHoldMin: 60 },
    { id: "boil", phase: "BOIL", requiresStabilization: true },
  ];

  it("force depuis AWAITING_STABILIZATION : avance + produit le log (auteur/date/étape/motif)", () => {
    const started = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    const res = transition(started, {
      type: "FORCE_STEP",
      at: 1_700_000_000_000,
      author: "brasseur@asso",
      reason: "Sonde HS",
    });
    expect(res.deviation).toEqual({
      stepId: "mash",
      phase: "MASH",
      author: "brasseur@asso",
      at: 1_700_000_000_000,
      reason: "Sonde HS",
      forcedFromStatus: "AWAITING_STABILIZATION",
    });
    expect(res.state.cursor).toBe(1);
    expect(res.state.completedStepIds).toEqual(["mash"]);
    expect(res.state.timer).toBeNull();
  });

  it("force depuis PENDING (étape jamais démarrée)", () => {
    const res = transition(initDayState(plan), {
      type: "FORCE_STEP",
      at: 5,
      author: "u",
      reason: "oubli",
    });
    expect(res.deviation?.forcedFromStatus).toBe("PENDING");
    expect(res.state.cursor).toBe(1);
  });

  it("forcer la dernière étape termine le brassin", () => {
    const single: DayPlan = [{ id: "only", phase: "PITCHING", requiresStabilization: false }];
    const res = transition(initDayState(single), {
      type: "FORCE_STEP",
      at: 0,
      author: "u",
      reason: "x",
    });
    expect(isFinished(res.state)).toBe(true);
    expect(res.state.status).toBe("COMPLETED");
  });
});

describe("Déterminisme", () => {
  it("mêmes (state, event) → même résultat (aucune horloge interne)", () => {
    const plan: DayPlan = [
      { id: "mash", phase: "MASH", requiresStabilization: true, plannedHoldMin: 60 },
    ];
    const s = transition(initDayState(plan), { type: "START_STEP", at: 0 }).state;
    const a = transition(s, { type: "CONFIRM_STABILIZATION", at: 5 * MIN, temperatureC: 66 });
    const b = transition(s, { type: "CONFIRM_STABILIZATION", at: 5 * MIN, temperatureC: 66 });
    expect(a).toEqual(b);
    // l'état source n'est pas muté
    expect(s.status).toBe("AWAITING_STABILIZATION");
  });
});

describe("Parcours complet du plan par défaut (bout en bout)", () => {
  it("déroule les 6 phases jusqu'à COMPLETED", () => {
    let s = initDayState(defaultDayPlan());

    // INITIALIZATION
    s = drive(s, [
      { type: "START_STEP", at: 0 },
      { type: "VALIDATE_STEP", at: 0 },
    ]);
    expect(currentStep(s)?.phase).toBe("MASH");

    // MASH : stabilisation (enregistre la température requise) puis palier 60 min
    s = drive(s, [
      { type: "START_STEP", at: 1 * MIN },
      { type: "CONFIRM_STABILIZATION", at: 15 * MIN, temperatureC: 66 },
      { type: "VALIDATE_STEP", at: 75 * MIN },
    ]);
    expect(currentStep(s)?.phase).toBe("LAUTER");

    // LAUTER : mesures densité + volume requises
    s = drive(s, [
      { type: "START_STEP", at: 80 * MIN },
      { type: "RECORD_MEASUREMENT", at: 81 * MIN, kind: "density", value: 1.048 },
      { type: "RECORD_MEASUREMENT", at: 81 * MIN, kind: "volume", value: 26 },
      { type: "VALIDATE_STEP", at: 82 * MIN },
    ]);
    expect(currentStep(s)?.phase).toBe("BOIL");

    // BOIL : palier 60 min après stabilisation (ébullition)
    s = drive(s, [
      { type: "START_STEP", at: 85 * MIN },
      { type: "CONFIRM_STABILIZATION", at: 100 * MIN },
      { type: "VALIDATE_STEP", at: 160 * MIN },
    ]);
    expect(currentStep(s)?.phase).toBe("COOLING");

    // COOLING : stabilisation (température requise), pas de palier
    s = drive(s, [
      { type: "START_STEP", at: 165 * MIN },
      { type: "CONFIRM_STABILIZATION", at: 190 * MIN, temperatureC: 20 },
      { type: "VALIDATE_STEP", at: 191 * MIN },
    ]);
    expect(currentStep(s)?.phase).toBe("PITCHING");

    // PITCHING : jalon final
    s = drive(s, [
      { type: "START_STEP", at: 195 * MIN },
      { type: "VALIDATE_STEP", at: 196 * MIN },
    ]);

    expect(isFinished(s)).toBe(true);
    expect(s.status).toBe("COMPLETED");
    expect(s.completedStepIds).toEqual(["init", "mash", "lauter", "boil", "cooling", "pitching"]);
  });
});
