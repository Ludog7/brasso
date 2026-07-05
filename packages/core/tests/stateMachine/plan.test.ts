import { describe, expect, it } from "vitest";

import { CANONICAL_PHASES, defaultDayPlan } from "../../src/stateMachine/plan.js";
import type { Phase } from "../../src/stateMachine/types.js";

describe("CANONICAL_PHASES — ordre des phases Jour J", () => {
  it("suit Initialisation → … → Ensemencement", () => {
    expect(CANONICAL_PHASES).toEqual<Phase[]>([
      "INITIALIZATION",
      "MASH",
      "LAUTER",
      "BOIL",
      "COOLING",
      "PITCHING",
    ]);
  });
});

describe("defaultDayPlan — modèle par défaut", () => {
  it("produit une étape par phase canonique, dans l'ordre", () => {
    const plan = defaultDayPlan();
    expect(plan.map((s) => s.phase)).toEqual(CANONICAL_PHASES);
    expect(plan).toHaveLength(6);
  });

  it("MASH/BOIL/COOLING exigent une stabilisation ; les jalons non", () => {
    const byId = Object.fromEntries(defaultDayPlan().map((s) => [s.id, s]));
    expect(byId.mash.requiresStabilization).toBe(true);
    expect(byId.boil.requiresStabilization).toBe(true);
    expect(byId.cooling.requiresStabilization).toBe(true);
    expect(byId.init.requiresStabilization).toBe(false);
    expect(byId.lauter.requiresStabilization).toBe(false);
    expect(byId.pitching.requiresStabilization).toBe(false);
  });

  it("applique les surcharges par id, laisse les autres intactes", () => {
    const plan = defaultDayPlan({ mash: { plannedHoldMin: 90, targetTempC: 67 } });
    const mash = plan.find((s) => s.id === "mash");
    expect(mash?.plannedHoldMin).toBe(90);
    expect(mash?.targetTempC).toBe(67);
    // étape non surchargée inchangée
    expect(plan.find((s) => s.id === "boil")?.plannedHoldMin).toBe(60);
  });

  it("sans surcharge : durées/mesures de référence présentes", () => {
    const byId = Object.fromEntries(defaultDayPlan().map((s) => [s.id, s]));
    expect(byId.mash.plannedHoldMin).toBe(60);
    expect(byId.mash.requiredMeasurements).toEqual(["temperature"]);
    expect(byId.lauter.requiredMeasurements).toEqual(["density", "volume"]);
  });
});
