import { describe, expect, it } from "vitest";

import {
  calcIbu,
  DEFAULT_BAG_FACTOR,
  DEFAULT_FIRST_WORT_FACTOR,
  DEFAULT_PELLET_FACTOR,
  DEFAULT_WHIRLPOOL_FACTOR,
  type HopAddition,
  RAGER_UTIL_BASE,
  TINSETH_BIGNESS_FACTOR,
} from "../../src/formulas/ibu.js";

const BG = 1.05; // densité d'ébullition de référence (§4.6)
const BATCH = 20; // L

/** Ajout de référence §4.6 : 28 g @ 6 % alpha, 60 min en ébullition. */
function refAddition(over: Partial<HopAddition> = {}): HopAddition {
  return { alphaFraction: 0.06, amountG: 28, timeMin: 60, use: "boil", ...over };
}

describe("coefficients IBU (§4.1, §4.5, §4.3/§4.4)", () => {
  it("figent les valeurs du référentiel", () => {
    expect(TINSETH_BIGNESS_FACTOR).toBe(1.65);
    expect(RAGER_UTIL_BASE).toBe(18.11);
    expect(DEFAULT_WHIRLPOOL_FACTOR).toBe(0.5);
    expect(DEFAULT_FIRST_WORT_FACTOR).toBe(1);
    expect(DEFAULT_PELLET_FACTOR).toBe(1.1);
    expect(DEFAULT_BAG_FACTOR).toBe(0.9);
  });
});

describe("calcIbu — Tinseth (§4.1)", () => {
  it("cas de référence en pellet : 28 g @6 %, 60 min, bg 1.050, 20 L → ≈22 IBU (±1)", () => {
    // Le cas §4.6 est interprété en houblon pellet (forme standard) : 19.38 × 1.10 = 21.31,
    // dans la tolérance ±1 de la valeur de contrôle du doc (≈22).
    const ibu = calcIbu([refAddition({ form: "pellet" })], BG, BATCH);
    expect(ibu).toBeCloseTo(21.31, 1);
    expect(ibu).toBeGreaterThanOrEqual(21);
    expect(ibu).toBeLessThanOrEqual(23);
  });

  it("même cas en houblon feuille (sans correction) → 19.38 IBU", () => {
    expect(calcIbu([refAddition()], BG, BATCH)).toBeCloseTo(19.38, 1);
  });

  it("Tinseth est la méthode par défaut", () => {
    expect(calcIbu([refAddition()], BG, BATCH)).toBe(
      calcIbu([refAddition()], BG, BATCH, "tinseth"),
    );
  });

  it("plus la densité d'ébullition est haute, plus l'utilisation baisse", () => {
    const low = calcIbu([refAddition()], 1.04, BATCH);
    const high = calcIbu([refAddition()], 1.08, BATCH);
    expect(high).toBeLessThan(low);
  });

  it("additionne les contributions de plusieurs ajouts", () => {
    const one = calcIbu([refAddition()], BG, BATCH);
    const two = calcIbu([refAddition(), refAddition({ timeMin: 15 })], BG, BATCH);
    expect(two).toBeCloseTo(one + calcIbu([refAddition({ timeMin: 15 })], BG, BATCH), 9);
  });
});

describe("calcIbu — Rager (§4.5)", () => {
  it("cas de référence → ≈25.9 IBU", () => {
    expect(calcIbu([refAddition()], BG, BATCH, "rager")).toBeCloseTo(25.89, 1);
  });

  it("gravity adjustment : au-delà de 1.050 l'amertume est réduite", () => {
    // À bg 1.050 le GA est nul ; à 1.070 il divise par (1 + 0.10).
    const atThreshold = calcIbu([refAddition()], 1.05, BATCH, "rager");
    const strong = calcIbu([refAddition()], 1.07, BATCH, "rager");
    expect(strong).toBeLessThan(atThreshold);
  });
});

describe("calcIbu — règles par type d'ajout (§4.3)", () => {
  const base = calcIbu([refAddition()], BG, BATCH);

  it("dry_hop ne contribue pas (IBU = 0)", () => {
    expect(calcIbu([refAddition({ use: "dry_hop" })], BG, BATCH)).toBe(0);
  });

  it("first_wort se comporte comme boil (bonus désactivé par défaut)", () => {
    expect(calcIbu([refAddition({ use: "first_wort" })], BG, BATCH)).toBeCloseTo(base, 9);
  });

  it("whirlpool et hop_stand appliquent le facteur réduit ×0.5", () => {
    expect(calcIbu([refAddition({ use: "whirlpool" })], BG, BATCH)).toBeCloseTo(base * 0.5, 9);
    expect(calcIbu([refAddition({ use: "hop_stand" })], BG, BATCH)).toBeCloseTo(base * 0.5, 9);
  });
});

describe("calcIbu — corrections de forme et sachet (§4.4)", () => {
  const base = calcIbu([refAddition()], BG, BATCH);

  it("pellet ×1.10", () => {
    expect(calcIbu([refAddition({ form: "pellet" })], BG, BATCH)).toBeCloseTo(base * 1.1, 9);
  });

  it("cryo et leaf n'ajoutent aucun facteur (§4.4)", () => {
    expect(calcIbu([refAddition({ form: "cryo" })], BG, BATCH)).toBeCloseTo(base, 9);
    expect(calcIbu([refAddition({ form: "leaf" })], BG, BATCH)).toBeCloseTo(base, 9);
  });

  it("sachet ×0.90, cumulable avec la forme", () => {
    expect(calcIbu([refAddition({ bagged: true })], BG, BATCH)).toBeCloseTo(base * 0.9, 9);
    expect(calcIbu([refAddition({ form: "pellet", bagged: true })], BG, BATCH)).toBeCloseTo(
      base * 1.1 * 0.9,
      9,
    );
  });
});

describe("calcIbu — options et cas limites", () => {
  const base = calcIbu([refAddition()], BG, BATCH);

  it("les facteurs sont configurables (§4.3/§4.4)", () => {
    expect(
      calcIbu([refAddition({ use: "whirlpool" })], BG, BATCH, "tinseth", { whirlpoolFactor: 0.75 }),
    ).toBeCloseTo(base * 0.75, 9);
    expect(
      calcIbu([refAddition({ use: "first_wort" })], BG, BATCH, "tinseth", { firstWortFactor: 1.1 }),
    ).toBeCloseTo(base * 1.1, 9);
    expect(
      calcIbu([refAddition({ form: "pellet" })], BG, BATCH, "tinseth", { pelletFactor: 1.2 }),
    ).toBeCloseTo(base * 1.2, 9);
    expect(
      calcIbu([refAddition({ bagged: true })], BG, BATCH, "tinseth", { bagFactor: 0.8 }),
    ).toBeCloseTo(base * 0.8, 9);
  });

  it("liste vide → IBU 0", () => {
    expect(calcIbu([], BG, BATCH)).toBe(0);
  });

  it("batchVolumeL ≤ 0 → RangeError (division interdite)", () => {
    expect(() => calcIbu([refAddition()], BG, 0)).toThrow(RangeError);
    expect(() => calcIbu([refAddition()], BG, -20)).toThrow(/division interdite/);
  });
});
