import { describe, expect, it } from "vitest";

import {
  ALTITUDE_PSI_PER_1000FT,
  kegPressurePsi,
  primingSugar,
  residualCo2,
  SUGAR_FACTORS,
} from "../../src/formulas/carbonation.js";

describe("facteurs & constantes (§8.1/§8.2)", () => {
  it("figent les valeurs du référentiel", () => {
    expect(SUGAR_FACTORS).toEqual({ sucrose: 1.0, dextrose: 1.1, dme: 1.47 });
    expect(ALTITUDE_PSI_PER_1000FT).toBe(0.5);
  });
});

describe("residualCo2 — CO₂ résiduel (§8.1)", () => {
  it("4 °C → ≈1.48 vol ; 18 °C → ≈0.92 vol", () => {
    expect(residualCo2(4)).toBeCloseTo(1.4834, 3);
    expect(residualCo2(18)).toBeCloseTo(0.9151, 3);
  });

  it("plus la bière a été chaude, moins il reste de CO₂", () => {
    expect(residualCo2(20)).toBeLessThan(residualCo2(4));
  });
});

describe("primingSugar — sucre de refermentation (§8.1)", () => {
  it("validation : 19 L, 2,4 vol, fermentée à ~18 °C → ≈110 g saccharose", () => {
    // §8.1 : le CO₂ résiduel dépend de la T° MAX atteinte (fermentation ~18 °C),
    // pas de la T° de service. Le « refroidi à 4 °C » du doc = température de service.
    const g = primingSugar(19, 2.4, 18);
    expect(g).toBeCloseTo(110, 0); // ≈110 (cible doc ≈100-110 g)
    expect(g).toBeGreaterThanOrEqual(100);
    expect(g).toBeLessThan(112);
  });

  it("le saccharose est le sucre par défaut", () => {
    expect(primingSugar(19, 2.4, 18)).toBe(primingSugar(19, 2.4, 18, "sucrose"));
  });

  it("dextrose ×1.10 et DME ×1.47 par rapport au saccharose", () => {
    const base = primingSugar(19, 2.4, 18, "sucrose");
    expect(primingSugar(19, 2.4, 18, "dextrose")).toBeCloseTo(base * 1.1, 6);
    expect(primingSugar(19, 2.4, 18, "dme")).toBeCloseTo(base * 1.47, 6);
  });

  it("une bière plus chaude (moins de CO₂ résiduel) demande plus de sucre", () => {
    expect(primingSugar(19, 2.4, 18)).toBeGreaterThan(primingSugar(19, 2.4, 4));
  });
});

describe("kegPressurePsi — carbonatation forcée (§8.2)", () => {
  it("validation : 5 °C, 2,4 vol → ≈11.7 PSI (doc ≈11)", () => {
    expect(kegPressurePsi(2.4, 5)).toBeCloseTo(11.69, 1);
  });

  it("altitude par défaut = 0 ; +0.5 PSI par 1000 ft", () => {
    const seaLevel = kegPressurePsi(2.4, 5);
    expect(kegPressurePsi(2.4, 5, 0)).toBe(seaLevel);
    expect(kegPressurePsi(2.4, 5, 2000)).toBeCloseTo(seaLevel + 1.0, 6);
  });

  it("plus de volumes de CO₂ visés → plus de pression", () => {
    expect(kegPressurePsi(2.7, 5)).toBeGreaterThan(kegPressurePsi(2.4, 5));
  });
});
