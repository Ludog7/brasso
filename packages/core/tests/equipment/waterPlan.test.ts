import { describe, expect, it } from "vitest";

import {
  type BrewWaterPlanInput,
  computeBrewWaterPlan,
  type EquipmentParams,
  strikeWaterTemp,
} from "../../src/index.js";

// Profil d'équipement de référence (pertes usuelles).
const EQUIPMENT: EquipmentParams = {
  deadspaceL: 1,
  transferLossL: 1,
  evaporationRateLPerHour: 3,
  grainAbsorptionLPerKg: 1,
  nominalVolumeL: 40,
};

/** Cas canonique : 5 kg de grain, 20 L visés, 60 min d'ébullition, ratio 3. */
function canonicalInput(): BrewWaterPlanInput {
  return {
    grainKg: 5,
    batchVolumeL: 20,
    boilTimeMin: 60,
    equipment: EQUIPMENT,
    mashRatioLPerKg: 3,
    targetMashTempC: 67,
    grainTempC: 20,
  };
}

describe("computeBrewWaterPlan — assemblage plan d'eau (M3-01, FORMULES §6)", () => {
  it("calcule les volumes de référence (empâtage, évaporation, rinçage, total)", () => {
    const plan = computeBrewWaterPlan(canonicalInput());

    // Empâtage §6.1 : 3 L/kg × 5 kg = 15 L.
    expect(plan.mashWaterL).toBeCloseTo(15, 6);
    // Pertes : absorption 1 L/kg × 5 = 5 ; évaporation 3 L/h × 1 h = 3.
    expect(plan.grainAbsorptionLossL).toBeCloseTo(5, 6);
    expect(plan.evaporationLossL).toBeCloseTo(3, 6);
    // Chaudière : post-ébullition = 20 + 1 (transfert) = 21 ; pré-ébullition = 21 + 3 = 24.
    expect(plan.postBoilVolumeL).toBeCloseTo(21, 6);
    expect(plan.preBoilVolumeL).toBeCloseTo(24, 6);
    // Rinçage §6.2 : 24 + 5 + 1 − 15 = 15 ; total = 15 + 15 = 30.
    expect(plan.spargeWaterL).toBeCloseTo(15, 6);
    expect(plan.totalWaterL).toBeCloseTo(30, 6);
    expect(plan.overCapacity).toBe(false);
    expect(plan.warnings).toHaveLength(0);
  });

  it("dérive la strike temp via la formule M1-08 (§6.3) quand les températures sont fournies", () => {
    const plan = computeBrewWaterPlan(canonicalInput());
    expect(plan.strikeTempC).toBeCloseTo(strikeWaterTemp(3, 67, 20), 6);
  });

  it("strike temp = null si température de palier ou de grain absente", () => {
    const { targetMashTempC: _t, grainTempC: _g, ...rest } = canonicalInput();
    expect(computeBrewWaterPlan(rest).strikeTempC).toBeNull();
  });

  it("applique le ratio d'empâtage par défaut (3.0 L/kg) si non fourni ou invalide", () => {
    const { mashRatioLPerKg: _r, ...rest } = canonicalInput();
    expect(computeBrewWaterPlan(rest).mashWaterL).toBeCloseTo(15, 6);
    expect(computeBrewWaterPlan({ ...rest, mashRatioLPerKg: 0 }).mashWaterL).toBeCloseTo(15, 6);
  });

  it("garde-fou : rinçage négatif ramené à 0 avec avertissement", () => {
    // Ratio élevé → l'eau d'empâtage dépasse le besoin, sparge deviendrait négatif.
    const plan = computeBrewWaterPlan({ ...canonicalInput(), mashRatioLPerKg: 8 });
    expect(plan.spargeWaterL).toBe(0);
    expect(plan.warnings.some((w) => /rinçage négatif/i.test(w))).toBe(true);
  });

  it("garde-fou : dépassement de capacité nominale signalé (non bloquant)", () => {
    const plan = computeBrewWaterPlan({
      ...canonicalInput(),
      equipment: { ...EQUIPMENT, nominalVolumeL: 20 },
    });
    expect(plan.overCapacity).toBe(true);
    expect(plan.warnings.some((w) => /capacité nominale/i.test(w))).toBe(true);
  });

  it("sans grain (brassage extrait) : empâtage et absorption nuls", () => {
    const plan = computeBrewWaterPlan({ ...canonicalInput(), grainKg: 0 });
    expect(plan.mashWaterL).toBe(0);
    expect(plan.grainAbsorptionLossL).toBe(0);
    // Tout le volume vient du « rinçage » : préÉbullition + deadspace.
    expect(plan.spargeWaterL).toBeCloseTo(plan.preBoilVolumeL + EQUIPMENT.deadspaceL, 6);
  });

  it("évaporation proportionnelle à la durée d'ébullition (90 min → 4.5 L)", () => {
    const plan = computeBrewWaterPlan({ ...canonicalInput(), boilTimeMin: 90 });
    expect(plan.evaporationLossL).toBeCloseTo(4.5, 6);
    expect(plan.preBoilVolumeL).toBeCloseTo(25.5, 6);
  });
});
