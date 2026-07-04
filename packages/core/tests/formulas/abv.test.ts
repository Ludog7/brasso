import { describe, expect, it } from "vitest";

import {
  ABV_ALTERNATE_FG_DIVISOR,
  ABV_ALTERNATE_NUMERATOR,
  ABV_ALTERNATE_OG_TERM,
  ABW_MASS_FACTOR,
  calcAbv,
  calcAbw,
} from "../../src/formulas/abv.js";

describe("coefficients ABV/ABW (§3.2, §3.3)", () => {
  it("figent les valeurs du référentiel", () => {
    expect(ABV_ALTERNATE_NUMERATOR).toBe(76.08);
    expect(ABV_ALTERNATE_OG_TERM).toBe(1.775);
    expect(ABV_ALTERNATE_FG_DIVISOR).toBe(0.794);
    expect(ABW_MASS_FACTOR).toBe(0.789);
  });
});

describe("calcAbv — standard (§3.1)", () => {
  it("valeur de référence : American IPA 1.060 / 1.012 → 6,30 %", () => {
    expect(calcAbv(1.06, 1.012)).toBeCloseTo(6.3, 2);
  });

  it("méthode par défaut = standard", () => {
    expect(calcAbv(1.06, 1.012)).toBe(calcAbv(1.06, 1.012, "standard"));
  });

  it("OG = FG → 0 % (aucun sucre fermenté)", () => {
    expect(calcAbv(1.05, 1.05)).toBe(0);
  });
});

describe("calcAbv — alternate (§3.2)", () => {
  it("American IPA 1.060 / 1.012 → ≈ 6,51 %", () => {
    expect(calcAbv(1.06, 1.012, "alternate")).toBeCloseTo(6.51, 2);
  });

  it("bière forte (Imperial Stout 1.100 / 1.025) : alternate > standard", () => {
    // Le standard sous-estime au-delà de ~6–7 % ABV (§3.1) ; l'alternate corrige.
    const standard = calcAbv(1.1, 1.025);
    const alternate = calcAbv(1.1, 1.025, "alternate");
    expect(standard).toBeCloseTo(9.844, 2);
    expect(alternate).toBeCloseTo(10.913, 2);
    expect(alternate).toBeGreaterThan(standard);
  });

  it("les deux méthodes restent proches sur une bière légère", () => {
    // À faible ABV, l'écart standard/alternate est minime (< 0,3 %).
    const standard = calcAbv(1.04, 1.01);
    const alternate = calcAbv(1.04, 1.01, "alternate");
    expect(Math.abs(alternate - standard)).toBeLessThan(0.3);
  });
});

describe("calcAbw (§3.3)", () => {
  it("ABV → ABW : IPA 6,30 % / FG 1.012 → ≈ 4,91 %", () => {
    expect(calcAbw(6.3, 1.012)).toBeCloseTo(4.912, 2);
  });

  it("ABW < ABV (l'éthanol est moins dense que l'eau)", () => {
    const abv = calcAbv(1.06, 1.012);
    expect(calcAbw(abv, 1.012)).toBeLessThan(abv);
  });
});
