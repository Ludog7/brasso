import { describe, expect, it } from "vitest";

import {
  buildDayPlan,
  type DayPhase,
  DEFAULT_AROMA_HOP_THRESHOLD_MIN,
  phaseToDayPhase,
} from "../../src/stateMachine/buildPlan.js";
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

    // M9-03 : WHIRLPOOL est désormais **repris** (il était droppé — c'était le
    // bug : une étape décrite dans la recette disparaissait du Jour J).
    // CONDITION / PACKAGE restent hors périmètre Jour J : ils relèvent du cycle
    // post-ensemencement (jalons M9-05) et du conditionnement (M9-08).
    expect(plan.map((s) => s.phase)).toEqual<Phase[]>([
      "INITIALIZATION",
      "MASH",
      "LAUTER",
      "BOIL",
      "WHIRLPOOL",
      "COOLING",
      "PITCHING",
    ]);
    expect(plan.map((s) => s.id)).toEqual([
      "init",
      "mash-1",
      "lauter-1",
      "boil-1",
      "whirlpool-1",
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
    // M9-06 : l'ensemencement exige désormais le volume ensemencé.
    expect(map["pitching-1"].requiredMeasurements).toEqual(["volume"]);
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

describe("M9-03 — whirlpool réintégré au plan", () => {
  it("mappe WHIRLPOOL avec des ids stables, entre ébullition et refroidissement", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("BOIL", { timeMin: 60 }),
        step("WHIRLPOOL", { timeMin: 15, tempC: 80 }),
        step("WHIRLPOOL", { timeMin: 10 }),
        step("COOL", { targetTempC: 20 }),
      ]),
    });

    const whirlpools = plan.filter((s) => s.phase === "WHIRLPOOL");
    expect(whirlpools.map((s) => s.id)).toEqual(["whirlpool-1", "whirlpool-2"]);
    expect(whirlpools[0]).toMatchObject({ plannedHoldMin: 15, targetTempC: 80 });
    // Le whirlpool ne vise aucune consigne de chauffe : pas de stabilisation.
    expect(whirlpools[0]?.requiresStabilization).toBe(false);
    // Ordre : ébullition avant, refroidissement après.
    const phases = plan.map((s) => s.phase);
    expect(phases.indexOf("BOIL")).toBeLessThan(phases.indexOf("WHIRLPOOL"));
    expect(phases.indexOf("WHIRLPOOL")).toBeLessThan(phases.indexOf("COOLING"));
  });

  it("sans whirlpool déclaré, aucune étape n'est inventée", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("BOIL", { timeMin: 60 }),
        step("COOL", { targetTempC: 20 }),
      ]),
    });
    expect(plan.some((s) => s.phase === "WHIRLPOOL")).toBe(false);
  });

  it("phaseToDayPhase mappe WHIRLPOOL vers la valeur Prisma", () => {
    expect(phaseToDayPhase("WHIRLPOOL")).toBe<DayPhase>("WHIRLPOOL");
  });

  it("le refroidissement porte la contrainte de température descendante", () => {
    const plan = buildDayPlan({ recipeSnapshot: snapshotOf([step("COOL", { targetTempC: 20 })]) });
    expect(byId(plan)["cooling-1"]).toMatchObject({
      targetTempC: 20,
      targetTempConstraint: "at_most",
    });
  });
});

describe("M9-03 — assainissement du circuit de refroidissement (étape dérivée)", () => {
  const brewWithCooling = (boilMin: number): unknown =>
    snapshotOf([
      step("MASH", { tempC: 66, timeMin: 60 }),
      step("BOIL", { timeMin: boilMin }),
      step("COOL", { targetTempC: 20 }),
    ]);

  it("scinde l'ébullition : l'assainissement occupe les dernières minutes", () => {
    const plan = buildDayPlan({
      recipeSnapshot: brewWithCooling(60),
      coolingCircuitSanitizeLeadMin: 5,
    });
    const steps = byId(plan);

    // L'assainissement s'intercale entre l'ébullition et le refroidissement.
    expect(plan.map((s) => s.id)).toEqual([
      "init",
      "mash-1",
      "boil-1",
      "boil-sanitize-1",
      "cooling-1",
    ]);
    expect(steps["boil-1"]?.plannedHoldMin).toBe(55);
    expect(steps["boil-sanitize-1"]?.plannedHoldMin).toBe(5);
    // Le temps d'ébullition total est conservé : 55 + 5 = 60.
    expect(
      (steps["boil-1"]?.plannedHoldMin ?? 0) + (steps["boil-sanitize-1"]?.plannedHoldMin ?? 0),
    ).toBe(60);
    expect(steps["boil-sanitize-1"]?.phase).toBe("BOIL");
  });

  it("ébullition plus courte que le délai : l'assainissement couvre toute l'ébullition", () => {
    const plan = buildDayPlan({
      recipeSnapshot: brewWithCooling(3),
      coolingCircuitSanitizeLeadMin: 5,
    });
    const steps = byId(plan);
    // Ni durée négative, ni étape omise.
    expect(steps["boil-1"]?.plannedHoldMin).toBe(0);
    expect(steps["boil-sanitize-1"]?.plannedHoldMin).toBe(3);
  });

  it("sans refroidissement, pas de circuit à assainir → aucune étape", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([step("BOIL", { timeMin: 60 })]),
      coolingCircuitSanitizeLeadMin: 5,
    });
    expect(plan.some((s) => s.id === "boil-sanitize-1")).toBe(false);
  });

  it("sans durée d'ébullition connue → aucune étape", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([step("BOIL", {}), step("COOL", { targetTempC: 20 })]),
      coolingCircuitSanitizeLeadMin: 5,
    });
    expect(plan.some((s) => s.id === "boil-sanitize-1")).toBe(false);
  });

  it("délai absent ou nul → aucune étape (core n'invente pas de valeur, ADR-01)", () => {
    for (const lead of [undefined, 0, -5, Number.NaN]) {
      const plan = buildDayPlan({
        recipeSnapshot: brewWithCooling(60),
        coolingCircuitSanitizeLeadMin: lead,
      });
      expect(plan.some((s) => s.id === "boil-sanitize-1")).toBe(false);
      expect(byId(plan)["boil-1"]?.plannedHoldMin).toBe(60);
    }
  });

  it("ADR-11 : le libellé parle d'assainissement, jamais de stérilisation", () => {
    const plan = buildDayPlan({
      recipeSnapshot: brewWithCooling(60),
      coolingCircuitSanitizeLeadMin: 5,
    });
    const texte = plan.map((s) => s.label ?? "").join(" ");
    expect(texte).toMatch(/assainissement/i);
    expect(texte).not.toMatch(/stéril/i);
    expect(texte).not.toMatch(/conforme/i);
    expect(texte).not.toMatch(/\bsûre?\b/i);
  });
});

describe("M9-04 — alertes de houblonnage pendant l'ébullition", () => {
  /** Ingrédient houblon tel que figé dans le snapshot (miroir `RecipeIngredient`). */
  const hop = (
    name: string,
    use: string,
    timeMinutes?: number,
    extra: Record<string, unknown> = {},
  ): unknown => ({
    category: "HOP",
    name,
    amount: 20,
    unit: "GRAM",
    use,
    timeMinutes,
    params: { alphaFraction: 0.06 },
    ...extra,
  });

  const snapshotWithHops = (
    ingredients: readonly unknown[],
    steps: readonly unknown[] = [step("BOIL", { timeMin: 60 }), step("COOL", { targetTempC: 20 })],
  ): unknown => ({ id: "r1", steps, ingredients });

  it("critère observable : ébullition 60 min, ajouts à 60/15/0 restants → offsets 0/45/60, natures amérisant/aromatique/hors-flamme", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotWithHops([
        hop("Citra", "BOIL", 0),
        hop("Magnum", "BOIL", 60),
        hop("Cascade", "BOIL", 15),
      ]),
    });
    expect(byId(plan)["boil-1"]?.hopAdditions).toEqual([
      {
        name: "Magnum",
        amountG: 20,
        nature: "BITTERING",
        remainingMin: 60,
        offsetFromStartMin: 0,
        inconsistent: false,
      },
      {
        name: "Cascade",
        amountG: 20,
        nature: "AROMA",
        remainingMin: 15,
        offsetFromStartMin: 45,
        inconsistent: false,
      },
      {
        name: "Citra",
        amountG: 20,
        nature: "FLAME_OUT",
        remainingMin: 0,
        offsetFromStartMin: 60,
        inconsistent: false,
      },
    ]);
  });

  it("FIRST_WORT : amérisant, vaut toute l'ébullition (offset 0), temps déclaré ignoré", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotWithHops([hop("Perle", "FIRST_WORT", 10)]),
    });
    expect(byId(plan)["boil-1"]?.hopAdditions).toEqual([
      {
        name: "Perle",
        amountG: 20,
        nature: "BITTERING",
        remainingMin: 60,
        offsetFromStartMin: 0,
        inconsistent: false,
      },
    ]);
  });

  it("hors-flamme distinguable du dernier aromatique (natures distinctes)", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotWithHops([hop("Mosaic", "BOIL", 5), hop("Citra", "BOIL", 0)]),
    });
    const natures = byId(plan)["boil-1"]?.hopAdditions?.map((a) => a.nature);
    expect(natures).toEqual(["AROMA", "FLAME_OUT"]);
  });

  it("restant > durée d'ébullition : offset borné à 0 et incohérence signalée", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotWithHops([hop("Herkules", "BOIL", 90)]),
    });
    expect(byId(plan)["boil-1"]?.hopAdditions).toEqual([
      {
        name: "Herkules",
        amountG: 20,
        nature: "BITTERING",
        remainingMin: 90,
        offsetFromStartMin: 0,
        inconsistent: true,
      },
    ]);
  });

  it("tri stable : offset croissant, à égalité par nom (doublon toléré)", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotWithHops([
        hop("Simcoe", "BOIL", 10),
        hop("Amarillo", "BOIL", 10),
        hop("Amarillo", "BOIL", 10), // même houblon ajouté deux fois au même moment
        hop("Magnum", "BOIL", 60),
        hop("Zeus", "BOIL", 10),
      ]),
    });
    expect(byId(plan)["boil-1"]?.hopAdditions?.map((a) => a.name)).toEqual([
      "Magnum",
      "Amarillo",
      "Amarillo",
      "Simcoe",
      "Zeus",
    ]);
  });

  describe("seuil amérisant / aromatique", () => {
    it("au seuil exact (défaut 20 min) : amérisant ; juste en deçà : aromatique", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops([
          hop("AuSeuil", "BOIL", DEFAULT_AROMA_HOP_THRESHOLD_MIN),
          hop("SousLeSeuil", "BOIL", DEFAULT_AROMA_HOP_THRESHOLD_MIN - 1),
        ]),
      });
      const byName = Object.fromEntries(
        (byId(plan)["boil-1"]?.hopAdditions ?? []).map((a) => [a.name, a.nature]),
      );
      expect(byName).toEqual({ AuSeuil: "BITTERING", SousLeSeuil: "AROMA" });
    });

    it("le seuil est ajustable par l'appelant (aromaHopThresholdMin)", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops([hop("Cascade", "BOIL", 25)]),
        aromaHopThresholdMin: 30,
      });
      expect(byId(plan)["boil-1"]?.hopAdditions?.[0]?.nature).toBe("AROMA");
    });

    it("un seuil non fini retombe sur le défaut", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops([hop("Cascade", "BOIL", 15)]),
        aromaHopThresholdMin: Number.NaN,
      });
      expect(byId(plan)["boil-1"]?.hopAdditions?.[0]?.nature).toBe("AROMA");
    });
  });

  describe("ajouts WHIRLPOOL", () => {
    it("rattachés à l'étape whirlpool (offset 0, hors-flamme), pas à l'ébullition", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops(
          [hop("Magnum", "BOIL", 60), hop("Galaxy", "WHIRLPOOL"), hop("Azacca", "WHIRLPOOL")],
          [
            step("BOIL", { timeMin: 60 }),
            step("WHIRLPOOL", { timeMin: 15 }),
            step("COOL", { targetTempC: 20 }),
          ],
        ),
      });
      const map = byId(plan);
      expect(map["whirlpool-1"]?.hopAdditions).toEqual([
        {
          name: "Azacca",
          amountG: 20,
          nature: "FLAME_OUT",
          remainingMin: 0,
          offsetFromStartMin: 0,
          inconsistent: false,
        },
        {
          name: "Galaxy",
          amountG: 20,
          nature: "FLAME_OUT",
          remainingMin: 0,
          offsetFromStartMin: 0,
          inconsistent: false,
        },
      ]);
      expect(map["boil-1"]?.hopAdditions?.map((a) => a.name)).toEqual(["Magnum"]);
    });

    it("sans étape whirlpool au plan : repli en hors-flamme en fin d'ébullition", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops([hop("Galaxy", "WHIRLPOOL")]),
      });
      expect(byId(plan)["boil-1"]?.hopAdditions).toEqual([
        {
          name: "Galaxy",
          amountG: 20,
          nature: "FLAME_OUT",
          remainingMin: 0,
          offsetFromStartMin: 60,
          inconsistent: false,
        },
      ]);
    });
  });

  describe("lecture défensive des ingrédients", () => {
    it("ignore non-houblon, DRY_HOP, moment d'emploi hors ébullition, et lignes malformées", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops([
          null,
          "bogus",
          { name: "SansCatégorie", use: "BOIL", timeMinutes: 10 },
          { category: "MALT", name: "Pilsner", amount: 5000, use: "BOIL", timeMinutes: 10 },
          hop("Citra", "DRY_HOP", 0),
          hop("Saaz", "MASH", 10),
          hop("", "BOIL", 10), // nom vide
          hop("SansTemps", "BOIL"), // temps non numérique → ignoré sans exception
          hop("TempsTexte", "BOIL", "dix" as unknown as number),
          hop("QuantitéKO", "BOIL", 10, { amount: "beaucoup" }),
          hop("Magnum", "BOIL", 60),
        ]),
      });
      expect(byId(plan)["boil-1"]?.hopAdditions?.map((a) => a.name)).toEqual(["Magnum"]);
    });

    it("snapshot sans houblon → aucune échéance, aucune erreur", () => {
      for (const ingredients of [[], [{ category: "MALT", name: "Pilsner", amount: 5000 }]]) {
        const plan = buildDayPlan({ recipeSnapshot: snapshotWithHops(ingredients) });
        expect(plan.every((s) => s.hopAdditions === undefined)).toBe(true);
      }
    });

    it("ingrédients absents ou non-tableau → aucune échéance, aucune erreur", () => {
      for (const recipeSnapshot of [
        snapshotOf([step("BOIL", { timeMin: 60 })]), // pré-M9 : pas de clé ingredients lue
        { id: "r1", steps: [step("BOIL", { timeMin: 60 })], ingredients: "nope" },
      ]) {
        const plan = buildDayPlan({ recipeSnapshot });
        expect(plan.every((s) => s.hopAdditions === undefined)).toBe(true);
      }
    });

    it("sans durée d'ébullition connue, aucun offset n'est calculable → pas d'échéance d'ébullition", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops(
          [hop("Magnum", "BOIL", 60), hop("Perle", "FIRST_WORT"), hop("Galaxy", "WHIRLPOOL")],
          [step("BOIL", {}), step("COOL", { targetTempC: 20 })],
        ),
      });
      expect(plan.every((s) => s.hopAdditions === undefined)).toBe(true);
    });

    it("ajout WHIRLPOOL rattaché au whirlpool même sans durée d'ébullition", () => {
      const plan = buildDayPlan({
        recipeSnapshot: snapshotWithHops(
          [hop("Galaxy", "WHIRLPOOL"), hop("Magnum", "BOIL", 60)],
          [step("BOIL", {}), step("WHIRLPOOL", { timeMin: 15 })],
        ),
      });
      const map = byId(plan);
      expect(map["whirlpool-1"]?.hopAdditions?.map((a) => a.name)).toEqual(["Galaxy"]);
      expect(map["boil-1"]?.hopAdditions).toBeUndefined();
    });
  });

  it("la scission d'assainissement (M9-03) conserve les échéances sur l'étape d'ébullition", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotWithHops([hop("Magnum", "BOIL", 60), hop("Citra", "BOIL", 0)]),
      coolingCircuitSanitizeLeadMin: 5,
    });
    const map = byId(plan);
    expect(map["boil-1"]?.plannedHoldMin).toBe(55);
    // Les offsets restent relatifs au début de l'ébullition : la scission
    // conserve le début et la durée totale (55 + 5 = 60).
    expect(map["boil-1"]?.hopAdditions?.map((a) => a.offsetFromStartMin)).toEqual([0, 60]);
    expect(map["boil-sanitize-1"]?.hopAdditions).toBeUndefined();
  });
});

describe("M9-06 — prises de volume aux étapes clés", () => {
  const brew = (extra: readonly unknown[] = []): unknown =>
    snapshotOf([
      step("MASH", { tempC: 66, timeMin: 60 }),
      step("SPARGE", { tempC: 76 }),
      step("BOIL", { timeMin: 60 }),
      ...extra,
      step("COOL", { targetTempC: 20 }),
      step("FERMENT", {}),
    ]);

  it("non-régression : la filtration exige toujours densité ET volume", () => {
    const plan = byId(buildDayPlan({ recipeSnapshot: brew() }));
    expect(plan["lauter-1"]?.requiredMeasurements).toEqual(["density", "volume"]);
  });

  it("la fin d'ébullition exige le volume post-ébullition", () => {
    const plan = byId(buildDayPlan({ recipeSnapshot: brew() }));
    expect(plan["boil-1"]?.requiredMeasurements).toEqual(["volume"]);
  });

  it("l'ensemencement exige le volume ensemencé", () => {
    const plan = byId(buildDayPlan({ recipeSnapshot: brew() }));
    expect(plan["pitching-1"]?.requiredMeasurements).toEqual(["volume"]);
  });

  it("le volume conditionné n'est pas une mesure du Jour J", () => {
    // Il se relève en fin de garde (M9-13) : aucune étape du plan ne l'exige,
    // et le refroidissement comme le whirlpool restent sur leurs propres mesures.
    const plan = buildDayPlan({ recipeSnapshot: brew([step("WHIRLPOOL", { timeMin: 15 })]) });
    const map = byId(plan);
    expect(map["cooling-1"]?.requiredMeasurements).toEqual(["temperature"]);
    expect(map["whirlpool-1"]?.requiredMeasurements).toBeUndefined();
    // Trois prises de volume au total : filtration, fin d'ébullition, ensemencement.
    const withVolume = plan.filter((s) => s.requiredMeasurements?.includes("volume"));
    expect(withVolume.map((s) => s.id)).toEqual(["lauter-1", "boil-1", "pitching-1"]);
  });

  it("avec assainissement, la prise de volume suit la fin réelle de l'ébullition", () => {
    const plan = byId(buildDayPlan({ recipeSnapshot: brew(), coolingCircuitSanitizeLeadMin: 5 }));
    // L'ébullition s'achevant désormais 5 min plus tôt, la mesure passe sur
    // l'assainissement — dernière étape à feu vif.
    expect(plan["boil-1"]?.requiredMeasurements).toBeUndefined();
    expect(plan["boil-sanitize-1"]?.requiredMeasurements).toEqual(["volume"]);
  });

  describe("rétro-compatibilité : un brassin engagé ne doit pas se retrouver coincé", () => {
    const plan = buildDayPlan({ recipeSnapshot: brew() });

    /** Amène l'état jusqu'à l'étape `stepId`, en forçant tout ce qui précède. */
    const advanceTo = (stepId: string): DayState => {
      let state = initDayState(plan);
      let guard = 0;
      while (currentStep(state)?.id !== stepId && guard < 20) {
        guard += 1;
        state = transition(state, {
          type: "FORCE_STEP",
          at: guard * 1_000,
          author: "brasseur",
          reason: "mise en place du contexte de test",
        }).state;
      }
      return state;
    };

    it("l'étape se valide normalement une fois le volume saisi", () => {
      let state = advanceTo("pitching-1");
      state = transition(state, { type: "START_STEP", at: 10_000 }).state;
      // Sans le relevé, la validation nominale est refusée…
      expect(transition(state, { type: "VALIDATE_STEP", at: 11_000 }).rejection).toBeDefined();
      // …et l'accepte dès qu'il est saisi.
      state = transition(state, {
        type: "RECORD_MEASUREMENT",
        at: 12_000,
        kind: "volume",
        value: 25.5,
      }).state;
      expect(transition(state, { type: "VALIDATE_STEP", at: 13_000 }).rejection).toBeUndefined();
    });

    it("sans le relevé, « forcer l'étape » reste ouvert et journalise l'écart", () => {
      let state = advanceTo("pitching-1");
      state = transition(state, { type: "START_STEP", at: 10_000 }).state;
      const forced = transition(state, {
        type: "FORCE_STEP",
        at: 11_000,
        author: "brasseur",
        reason: "brassin démarré avant la mise à jour",
      });
      expect(forced.rejection).toBeUndefined();
      expect(forced.deviation).toMatchObject({ stepId: "pitching-1", phase: "PITCHING" });
      // Le brassin avance : il n'est pas coincé.
      expect(currentStep(forced.state)).toBeNull();
    });

    it("les mesures déjà saisies ne sont jamais perdues par un refus de validation", () => {
      let state = advanceTo("boil-1");
      state = transition(state, { type: "START_STEP", at: 10_000 }).state;
      state = transition(state, {
        type: "CONFIRM_STABILIZATION",
        at: 11_000,
        temperatureC: 100,
      }).state;
      const refused = transition(state, { type: "VALIDATE_STEP", at: 12_000 });
      expect(refused.rejection).toBeDefined();
      expect(refused.state.measurements).toEqual(state.measurements);
    });
  });
});

describe("M9-03 — rétro-compatibilité des snapshots antérieurs", () => {
  it("un snapshot pré-M9 (sans whirlpool) produit toujours un plan valide", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("MASH", { tempC: 66, timeMin: 60 }),
        step("SPARGE", { tempC: 76 }),
        step("BOIL", { timeMin: 60 }),
        step("COOL", { targetTempC: 20 }),
        step("FERMENT", {}),
      ]),
    });
    expect(plan.map((s) => s.phase)).toEqual<Phase[]>([
      "INITIALIZATION",
      "MASH",
      "LAUTER",
      "BOIL",
      "COOLING",
      "PITCHING",
    ]);
  });

  it("params inexploitables : lecture défensive, aucune exception", () => {
    const plan = buildDayPlan({
      recipeSnapshot: snapshotOf([
        step("WHIRLPOOL", { timeMin: "quinze", tempC: null }),
        step("COOL", { targetTempC: 20 }),
      ]),
      coolingCircuitSanitizeLeadMin: 5,
    });
    const wp = byId(plan)["whirlpool-1"];
    expect(wp?.plannedHoldMin).toBeUndefined();
    expect(wp?.targetTempC).toBeUndefined();
  });
});
