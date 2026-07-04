import { describe, expect, it } from "vitest";

import {
  HYDROMETER_CALIBRATION_C,
  hydrometerTempCorrect,
  refractoFgCorrected,
  refractoOgFromBrix,
} from "../../src/formulas/measurements.js";

describe("hydrometerTempCorrect — correction densimètre (§7.1)", () => {
  it("température de calibration par défaut = 20 °C", () => {
    expect(HYDROMETER_CALIBRATION_C).toBe(20);
  });

  it("lecture à la température de calibration → identité", () => {
    expect(hydrometerTempCorrect(1.05, 20, 20)).toBeCloseTo(1.05, 5);
    expect(hydrometerTempCorrect(1.05, 20)).toBeCloseTo(1.05, 5); // calC par défaut
  });

  it("lecture à chaud (30 °C, cal 20 °C) → densité corrigée plus haute", () => {
    const corrected = hydrometerTempCorrect(1.05, 30, 20);
    expect(corrected).toBeCloseTo(1.0526, 3);
    expect(corrected).toBeGreaterThan(1.05);
  });

  it("lecture à froid (10 °C) → densité corrigée plus basse", () => {
    expect(hydrometerTempCorrect(1.05, 10, 20)).toBeLessThan(1.05);
  });
});

describe("refractoOgFromBrix — moût non fermenté (§7.2)", () => {
  it("12 °Bx, WCF 1.04 → OG ≈ 1.0464", () => {
    expect(refractoOgFromBrix(12, 1.04)).toBeCloseTo(1.0464, 4);
  });

  it("WCF par défaut = 1.04", () => {
    expect(refractoOgFromBrix(12)).toBe(refractoOgFromBrix(12, 1.04));
  });

  it("WCF ≤ 0 → RangeError (division interdite)", () => {
    expect(() => refractoOgFromBrix(12, 0)).toThrow(RangeError);
    expect(() => refractoOgFromBrix(12, -1)).toThrow(/division interdite/);
  });
});

describe("refractoFgCorrected — correction alcool (§7.3, cf. bug #43)", () => {
  it("validation Terrill cubique : OB 12 / FB 6,5 / WCF 1.04 → FG ≈ 0.999 (±0,002)", () => {
    // Corrigé (bug #43) : FB 6,5 = bière très sèche → 0.99908, PAS 1.010 (ancienne
    // valeur du doc, qui provenait en fait de l'équation « standard »).
    const fg = refractoFgCorrected(12, 6.5, 1.04, "terrill_cubic");
    expect(fg).toBeCloseTo(0.99908, 4);
    expect(fg).toBeGreaterThan(0.999 - 0.002);
    expect(fg).toBeLessThan(0.999 + 0.002);
  });

  it("Terrill cubique est la méthode par défaut", () => {
    expect(refractoFgCorrected(12, 6.5, 1.04)).toBe(
      refractoFgCorrected(12, 6.5, 1.04, "terrill_cubic"),
    );
  });

  it("Terrill linéaire → ≈ 1.0217", () => {
    expect(refractoFgCorrected(12, 6.5, 1.04, "terrill_linear")).toBeCloseTo(1.02167, 4);
  });

  it("méthode « standard » simple → ≈ 1.0112 (renvoie bien une SG, cf. bug #43)", () => {
    const fg = refractoFgCorrected(12, 6.5, 1.04, "simple");
    expect(fg).toBeCloseTo(1.01121, 4);
    // Régression du bug : l'ancienne formule cassée renvoyait ~6.76.
    expect(fg).toBeGreaterThan(1);
    expect(fg).toBeLessThan(1.03);
  });

  it("WCF par défaut = 1.04", () => {
    expect(refractoFgCorrected(12, 6.5)).toBe(refractoFgCorrected(12, 6.5, 1.04, "terrill_cubic"));
  });

  it("WCF ≤ 0 → RangeError (division interdite)", () => {
    expect(() => refractoFgCorrected(12, 6.5, 0)).toThrow(RangeError);
    expect(() => refractoFgCorrected(12, 6.5, -1)).toThrow(/division interdite/);
  });
});
