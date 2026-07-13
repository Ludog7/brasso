import { describe, expect, it } from "vitest";

import { buildDayPlan, type DayPhase, phaseToDayPhase } from "../../src/stateMachine/buildPlan.js";
import {
  currentStep,
  initDayState,
  isFinished,
  transition,
} from "../../src/stateMachine/machine.js";
import type { DayState, Phase, StepSpec } from "../../src/stateMachine/types.js";

/** Snapshot minimal (mirroir sérialisé de `RecipeWithDetails`) : juste les `steps`. */
const snapshotOf = (steps: readonly unknown[]): unknown => ({ id: "r1", steps });

/** Étape de recette telle que figée dans le snapshot. */
const step = (
  type: string,
  params: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): unknown => ({ id: `s-${type}`, type, params, ...extra });

const byId = (plan: readonly StepSpec[]): Record<string, StepSpec> =>
  Object.fromEntries(plan.map((s) => [s.id, s]));

describe("buildDayPlan — dérivation recette → plan Jour J", () => {
  it("empâtage multi-paliers : un MASH par palier, ids stables mash-1/mash-2", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("MASH_STEP", { tempC: 52, timeMin: 15 }),
        step("MASH_STEP", { tempC: 66, timeMin: 45 }),
      ]),
    });

    const mashes = plan.filter((s) => s.phase === "MASH");
    expect(mashes.map((s) => s.id)).toEqual(["mash-1", "mash-2"]);
    expect(mashes[0]).toMatchObject({ targetTempC: 52, plannedHoldMin: 15 });
    expect(mashes[1]).toMatchObject({ targetTempC: 66, plannedHoldMin: 45 });
    for (const m of mashes) {
      expect(m.requiresStabilization).toBe(true);
      expect(m.requiredMeasurements).toEqual(["temperature"]);
    }
  });

  it("mappe le brassin complet dans l'ordre, jalon INITIALISATION en tête", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("MASH", { tempC: 66, timeMin: 60 }),
        step("SPARGE", { tempC: 76 }),
        step("BOIL", { timeMin: 60 }),
        step("WHIRLPOOL", { timeMin: 15 }),
        step("COOL", { targetTempC: 20 }),
        step("FERMENT", { tempC: 19, days: 14 }),
        step("CONDITION", {}),
        step("PACKAGE", {}),
      ]),
    });

    // WHIRLPOOL / CONDITION / PACKAGE sont hors périmètre Jour J → non repris.
    expect(plan.map((s) => s.phase)).toEqual<Phase[]>([
      "INITIALIZATION",
      "MASH",
      "LAUTER",
      "BOIL",
      "COOLING",
      "PITCHING",
    ]);
    expect(plan.map((s) => s.id)).toEqual([
      "init",
      "mash-1",
      "lauter-1",
      "boil-1",
      "cooling-1",
      "pitching-1",
    ]);
  });

  it("détaille les StepSpec par phase (stabilisation, mesures, cibles)", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("SPARGE", { tempC: 76 }),
        step("BOIL", { timeMin: 90 }),
        step("COOL", { targetTempC: 18 }),
        step("FERMENT", {}),
      ]),
    });
    const map = byId(plan);

    expect(map["lauter-1"]).toMatchObject({
      phase: "LAUTER",
      requiresStabilization: false,
      requiredMeasurements: ["density", "volume"],
      targetTempC: 76,
    });
    expect(map["boil-1"]).toMatchObject({
      phase: "BOIL",
      requiresStabilization: true,
      plannedHoldMin: 90,
      targetTempC: 100,
    });
    expect(map["cooling-1"]).toMatchObject({
      phase: "COOLING",
      requiresStabilization: true,
      requiredMeasurements: ["temperature"],
      targetTempC: 18,
    });
    expect(map["pitching-1"]).toMatchObject({
      phase: "PITCHING",
      requiresStabilization: false,
    });
    expect(map["pitching-1"].requiredMeasurements).toBeUndefined();
  });

  it("un seul jalon PITCHING même avec plusieurs étapes FERMENT", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("BOIL", { timeMin: 60 }),
        step("FERMENT", { days: 14 }),
        step("FERMENT", { days: 7 }),
      ]),
    });
    expect(plan.filter((s) => s.phase === "PITCHING")).toHaveLength(1);
  });

  it("respecte le nom de l'étape s'il est fourni, sinon libellé par défaut", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("MASH_STEP", { tempC: 66, timeMin: 60 }, { name: "Palier saccharification" }),
        step("BOIL", { timeMin: 60 }),
      ]),
    });
    const map = byId(plan);
    expect(map["mash-1"].label).toBe("Palier saccharification");
    expect(map["boil-1"].label).toBe("Ébullition");
  });

  it("ordonne les étapes par sortOrder, pas par position dans le tableau", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("BOIL", { timeMin: 60 }, { sortOrder: 2 }),
        step("MASH", { tempC: 66, timeMin: 60 }, { sortOrder: 0 }),
        step("SPARGE", { tempC: 76 }, { sortOrder: 1 }),
      ]),
    });
    expect(plan.map((s) => s.phase)).toEqual<Phase[]>(["INITIALIZATION", "MASH", "LAUTER", "BOIL"]);
  });

  describe("estimation de la rampe de chauffe (indicative)", () => {
    const mashOf = (equipment?: {
      heatingPowerKw?: number | null;
      thermalMassKjPerC?: number | null;
    }) =>
      byId(
        buildDayPlan({
          recipeSnapshot: snapshotOf([step("MASH_STEP", { tempC: 68, timeMin: 60 })]),
          equipment,
        }),
      )["mash-1"];

    it("sans profil : rampe par défaut (empâtage 15, ébullition 20)", () => {
      const plan = byId(
        buildDayPlan({
          recipeSnapshot: snapshotOf([
            step("MASH", { tempC: 66, timeMin: 60 }),
            step("BOIL", { timeMin: 60 }),
          ]),
        }),
      );
      expect(plan["mash-1"].plannedRampMin).toBe(15);
      expect(plan["boil-1"].plannedRampMin).toBe(20);
    });

    it("avec puissance + masse thermique : t = masse × ΔT / puissance / 60", () => {
      // ΔT empâtage = 68 − 20 = 48 °C ; 40 kJ/°C ; 5 kW → 40×48/(5×60) = 6,4 → 6 min.
      expect(mashOf({ heatingPowerKw: 5, thermalMassKjPerC: 40 }).plannedRampMin).toBe(6);
    });

    it("retombe sur le défaut si puissance ≤ 0, masse absente, ou cible inconnue", () => {
      expect(mashOf({ heatingPowerKw: 0, thermalMassKjPerC: 40 }).plannedRampMin).toBe(15);
      expect(mashOf({ heatingPowerKw: 5 }).plannedRampMin).toBe(15);
      // MASH sans tempC → cible inconnue → défaut, même avec un profil complet.
      const noTarget = byId(
        buildDayPlan({
          recipeSnapshot: snapshotOf([step("MASH", { timeMin: 60 })]),
          equipment: { heatingPowerKw: 5, thermalMassKjPerC: 40 },
        }),
      )["mash-1"];
      expect(noTarget.plannedRampMin).toBe(15);
      expect(noTarget.targetTempC).toBeUndefined();
    });
  });

  describe("fallback defaultDayPlan quand aucune étape exploitable", () => {
    it("snapshot sans steps → plan par défaut (6 phases)", () => {
      const plan = buildDayPlan({ recipeSnapshot: { id: "r1" } });
      expect(plan.map((s) => s.id)).toEqual([
        "init",
        "mash",
        "lauter",
        "boil",
        "cooling",
        "pitching",
      ]);
    });

    it("steps vides ou uniquement des types hors périmètre → plan par défaut", () => {
      expect(buildDayPlan({ recipeSnapshot: snapshotOf([]) })).toHaveLength(6);
      expect(
        buildDayPlan({
          recipeSnapshot: snapshotOf([step("PACKAGE", {}), step("CONDITION", {})]),
        }),
      ).toHaveLength(6);
    });

    it("snapshot non exploitable (null, chaîne, steps non-tableau) → plan par défaut", () => {
      expect(buildDayPlan({ recipeSnapshot: null })).toHaveLength(6);
      expect(buildDayPlan({ recipeSnapshot: "oops" })).toHaveLength(6);
      expect(buildDayPlan({ recipeSnapshot: { steps: "nope" } })).toHaveLength(6);
    });
  });

  describe("lecture défensive du snapshot", () => {
    it("ignore les entrées non-objet ou sans type, tolère params/sortOrder mal typés", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotOf([
          null,
          "bogus",
          { params: {} }, // pas de `type`
          step("MASH_STEP", "not-an-object" as unknown as Record<string, unknown>, {
            sortOrder: "x",
          }),
        ]),
      });
      // Seule l'étape MASH_STEP (params invalides → {}) est retenue.
      const map = byId(plan);
      expect(map["mash-1"]).toMatchObject({ phase: "MASH", requiresStabilization: true });
      expect(map["mash-1"].plannedHoldMin).toBeUndefined();
      expect(map["mash-1"].targetTempC).toBeUndefined();
    });

    it("ignore un nom vide (retombe sur le libellé par défaut)", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotOf([step("BOIL", { timeMin: 60 }, { name: "" })]),
      });
      expect(byId(plan)["boil-1"].label).toBe("Ébullition");
    });

    it("ignore une valeur de paramètre non finie", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotOf([step("MASH", { tempC: Infinity, timeMin: 60 })]),
      });
      expect(byId(plan)["mash-1"].targetTempC).toBeUndefined();
    });
  });
});

describe("phaseToDayPhase — mapping core ↔ enum Prisma DayPhase", () => {
  it("couvre les 6 phases + le brassin terminé (null → TERMINE)", () => {
    const mapping: Record<string, DayPhase> = {
      INITIALIZATION: "INITIALISATION",
      MASH: "EMPATAGE",
      LAUTER: "FILTRATION",
      BOIL: "EBULLITION",
      COOLING: "REFROIDISSEMENT",
      PITCHING: "ENSEMENCEMENT",
    };
    for (const [phase, expected] of Object.entries(mapping)) {
      expect(phaseToDayPhase(phase as Phase)).toBe(expected);
    }
    expect(phaseToDayPhase(null)).toBe("TERMINE");
  });
});

describe("plan dérivé — consommable par la state machine (M1-13)", () => {
  const plan = buildDayPlan({
    recipeSnapshot: snapshotOf([
      step("MASH_STEP", { tempC: 66, timeMin: 30 }),
      step("SPARGE", { tempC: 76 }),
      step("BOIL", { timeMin: 60 }),
      step("COOL", { targetTempC: 20 }),
      step("FERMENT", {}),
    ]),
  });

  it("le palier d'empâtage n'arme son timer qu'après stabilisation confirmée", () => {
    let state = initDayState(plan);
    // init (jalon) : démarrage → validation directe.
    state = transition(state, { type: "START_STEP", at: 0 }).state;
    state = transition(state, { type: "VALIDATE_STEP", at: 0 }).state;

    // mash-1 : requiresStabilization → pas de timer au START.
    state = transition(state, { type: "START_STEP", at: 1_000 }).state;
    expect(state.status).toBe("AWAITING_STABILIZATION");
    expect(state.timer).toBeNull();

    // La stabilisation arme le timer (feature sanctuarisée).
    state = transition(state, {
      type: "CONFIRM_STABILIZATION",
      at: 2_000,
      temperatureC: 66,
    }).state;
    expect(state.status).toBe("TIMER_RUNNING");
    expect(state.timer?.stepId).toBe("mash-1");
  });

  it("se déroule jusqu'à l'ensemencement puis TERMINE en forçant les étapes", () => {
    let state: DayState = initDayState(plan);
    const phases: DayPhase[] = [];
    let guard = 0;
    while (!isFinished(state) && guard++ < 20) {
      phases.push(phaseToDayPhase(currentStep(state)?.phase ?? null));
      const res = transition(state, {
        type: "FORCE_STEP",
        at: guard * 1_000,
        author: "brasseur",
        reason: "démo déroulé complet",
      });
      expect(res.deviation).toBeDefined();
      state = res.state;
    }
    expect(isFinished(state)).toBe(true);
    expect(phaseToDayPhase(currentStep(state)?.phase ?? null)).toBe("TERMINE");
    expect(phases).toEqual<DayPhase[]>([
      "INITIALISATION",
      "EMPATAGE",
      "FILTRATION",
      "EBULLITION",
      "REFROIDISSEMENT",
      "ENSEMENCEMENT",
    ]);
  });
});
