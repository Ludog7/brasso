import { describe, expect, it } from "vitest";

import {
  computeBiab,
  computeStarter,
  computeWaterPlan,
  dilutionWaterToTarget,
  PITCH_RATE_ALE,
  PITCH_RATE_LAGER,
  pitchRateForStyle,
} from "../../src/calculators/index.js";
import {
  biabInputSchema,
  dilutionToTargetInputSchema,
  starterInputSchema,
  waterPlanInputSchema,
} from "../../src/schemas/calculators.js";
import { sgToPlato } from "../../src/units.js";

// Validation contre les valeurs de référence FORMULES §6 (eau), §9.3 (dilution),
// §12.1 (starter) et §12.2 (BIAB).

describe("computeStarter — taux d'inoculation (§12.1)", () => {
  it("référence : ale, 20 L, OG 1.048 → ~178·10⁹ requises, déficit ~78, starter ~0.39 L", () => {
    const input = starterInputSchema.parse({
      og: 1.048,
      volumeL: 20,
      style: "ale",
      packs: 1,
      cellsPerPackB: 100,
      viability: 1,
    });
    const r = computeStarter(input);

    // °Plato dérivé de l'OG (§0.1) et composition exacte du besoin.
    expect(r.platoOfWort).toBeCloseTo(sgToPlato(1.048), 10);
    expect(r.platoOfWort).toBeCloseTo(11.9, 1);
    expect(r.pitchRate).toBe(PITCH_RATE_ALE);
    expect(r.cellsRequiredB).toBeCloseTo(0.75 * 20 * sgToPlato(1.048), 10);
    // Repères FORMULES §12.1 (≈ 178 / 78 / 0.39).
    expect(r.cellsRequiredB).toBeGreaterThan(175);
    expect(r.cellsRequiredB).toBeLessThan(182);
    expect(r.cellsAvailableB).toBe(100);
    expect(r.deficitB).toBeCloseTo(r.cellsRequiredB - 100, 10);
    expect(r.recommendedStarterL).toBeCloseTo(r.deficitB / 200, 10);
    expect(r.recommendedStarterL).toBeCloseTo(0.39, 2);
  });

  it("lager utilise le taux 1.5 ; un pitchRate explicite prime sur le style", () => {
    expect(pitchRateForStyle("lager")).toBe(PITCH_RATE_LAGER);
    const lager = computeStarter(
      starterInputSchema.parse({ og: 1.05, volumeL: 20, style: "lager" }),
    );
    expect(lager.pitchRate).toBe(1.5);

    const explicit = computeStarter(
      starterInputSchema.parse({ og: 1.05, volumeL: 20, style: "lager", pitchRate: 0.9 }),
    );
    expect(explicit.pitchRate).toBe(0.9);
  });

  it("levure suffisante → déficit nul et starter 0 ; viabilité réduit le disponible", () => {
    const enough = computeStarter(
      starterInputSchema.parse({ og: 1.04, volumeL: 20, packs: 4, cellsPerPackB: 200 }),
    );
    expect(enough.deficitB).toBe(0);
    expect(enough.recommendedStarterL).toBe(0);

    const halfViable = computeStarter(
      starterInputSchema.parse({
        og: 1.04,
        volumeL: 20,
        packs: 1,
        cellsPerPackB: 200,
        viability: 0.5,
      }),
    );
    expect(halfViable.cellsAvailableB).toBe(100);
  });

  it("schéma : OG ≤ 1.000 et viabilité hors [0,1] rejetées", () => {
    expect(starterInputSchema.safeParse({ og: 1.0, volumeL: 20 }).success).toBe(false);
    expect(starterInputSchema.safeParse({ og: 1.05, volumeL: 20, viability: 1.5 }).success).toBe(
      false,
    );
    // Défauts appliqués (style ale, packs 0, viabilité 1).
    expect(starterInputSchema.parse({ og: 1.05, volumeL: 20 }).style).toBe("ale");
  });
});

describe("dilutionWaterToTarget — inverse de la dilution (§9.3)", () => {
  it("1.060 sur 20 L → 1.050 : +4 L (volume final 24 L)", () => {
    const r = dilutionWaterToTarget(
      dilutionToTargetInputSchema.parse({ currentSg: 1.06, currentVolumeL: 20, targetSg: 1.05 }),
    );
    expect(r.finalVolumeL).toBeCloseTo(24, 10);
    expect(r.waterToAddL).toBeCloseTo(4, 10);
  });

  it("cible ≥ densité actuelle → RangeError (l'eau ne fait que diluer)", () => {
    expect(() =>
      dilutionWaterToTarget({ currentSg: 1.05, currentVolumeL: 20, targetSg: 1.05 }),
    ).toThrow(RangeError);
    expect(() =>
      dilutionWaterToTarget({ currentSg: 1.05, currentVolumeL: 20, targetSg: 1.06 }),
    ).toThrow(/ne fait que diluer/);
  });

  it("cible ≤ 1.000 → RangeError (division interdite)", () => {
    expect(() =>
      dilutionWaterToTarget({ currentSg: 1.05, currentVolumeL: 20, targetSg: 1.0 }),
    ).toThrow(/division interdite/);
  });
});

describe("computeWaterPlan — plan d'eau empâtage/rinçage/strike (§6)", () => {
  it("5 kg, ratio 3, 30 L pré-ébullition → empâtage 15, rinçage 20, total 35, strike ≈ 73.4", () => {
    const r = computeWaterPlan(
      waterPlanInputSchema.parse({
        grainKg: 5,
        mashRatioLPerKg: 3,
        boilVolumeL: 30,
        targetTempC: 67,
        grainTempC: 20,
      }),
    );
    expect(r.mashWaterL).toBeCloseTo(15, 10);
    expect(r.spargeWaterL).toBeCloseTo(20, 10); // 30 + 1.0×5 + 0 − 15
    expect(r.totalWaterL).toBeCloseTo(35, 10);
    expect(r.strikeTempC).toBeCloseTo((0.41 / 3) * (67 - 20) + 67, 6); // ≈ 73.42
  });

  it("schéma : ratio par défaut 3.0 et deadSpace 0", () => {
    const parsed = waterPlanInputSchema.parse({
      grainKg: 5,
      boilVolumeL: 30,
      targetTempC: 67,
      grainTempC: 20,
    });
    expect(parsed.mashRatioLPerKg).toBe(3.0);
    expect(parsed.deadSpaceL).toBe(0);
  });
});

describe("computeBiab — brassage une cuve, sans rinçage (§12.2)", () => {
  it("référence : 5 kg, 30 L pré-ébullition → eau totale 35, absorption 5, ratio 7, strike ≈ 69.75", () => {
    const r = computeBiab(
      biabInputSchema.parse({ grainKg: 5, boilVolumeL: 30, targetTempC: 67, grainTempC: 20 }),
    );
    expect(r.absorptionL).toBeCloseTo(5, 10);
    expect(r.totalWaterL).toBeCloseTo(35, 10);
    expect(r.mashRatioLPerKg).toBeCloseTo(7, 10);
    expect(r.strikeTempC).toBeCloseTo((0.41 / 7) * (67 - 20) + 67, 6); // ≈ 69.75
  });

  it("volume mort et absorption personnalisée augmentent l'eau totale", () => {
    const r = computeBiab(
      biabInputSchema.parse({
        grainKg: 5,
        boilVolumeL: 30,
        deadSpaceL: 2,
        grainAbsorptionLPerKg: 1.2,
        targetTempC: 67,
        grainTempC: 20,
      }),
    );
    expect(r.absorptionL).toBeCloseTo(6, 10);
    expect(r.totalWaterL).toBeCloseTo(38, 10); // 30 + 6 + 2
  });

  it("schéma : grainKg ≤ 0 rejeté", () => {
    expect(
      biabInputSchema.safeParse({ grainKg: 0, boilVolumeL: 30, targetTempC: 67, grainTempC: 20 })
        .success,
    ).toBe(false);
  });
});
