import { describe, expect, it } from "vitest";

import { blend, dilute, realAttenuation, realEfficiency } from "../../src/formulas/postmortem.js";
import { points } from "../../src/units.js";

describe("realEfficiency — rendement réel (§9.1)", () => {
  it("5 kg Pale (1.037), OG mesurée 1.00666, 20 L → ≈72 % (boucle avec calcOg M1-04)", () => {
    // pointsThéo = 37 × 5 = 185 ; pointsObt = 6.66 × 20 = 133.2 ; 100 × 133.2/185 = 72 %.
    const grist = [{ potentialSg: 1.037, amountG: 5000, isMashable: true }];
    expect(realEfficiency(grist, 1.00666, 20)).toBeCloseTo(72, 1);
  });

  it("une OG mesurée plus haute traduit un meilleur rendement", () => {
    const grist = [{ potentialSg: 1.037, amountG: 5000, isMashable: true }];
    expect(realEfficiency(grist, 1.008, 20)).toBeGreaterThan(realEfficiency(grist, 1.006, 20));
  });

  it("grist vide → RangeError (potentiel théorique nul)", () => {
    expect(() => realEfficiency([], 1.05, 20)).toThrow(RangeError);
    expect(() => realEfficiency([], 1.05, 20)).toThrow(/division interdite/);
  });
});

describe("realAttenuation — atténuation réelle (§9.2)", () => {
  it("OG 1.060 / FG 1.012 → 80 %", () => {
    expect(realAttenuation(1.06, 1.012)).toBeCloseTo(80, 6);
  });

  it("une FG plus basse traduit une atténuation plus forte", () => {
    expect(realAttenuation(1.06, 1.008)).toBeGreaterThan(realAttenuation(1.06, 1.012));
  });

  it("OG ≤ 1.000 → RangeError (division interdite)", () => {
    expect(() => realAttenuation(1.0, 1.0)).toThrow(RangeError);
    expect(() => realAttenuation(0.999, 0.998)).toThrow(/division interdite/);
  });
});

describe("dilute — ajustement de volume (§9.3)", () => {
  it("20 L de 1.050 dilués à 25 L → 1.040", () => {
    expect(dilute(1.05, 20, 25)).toBeCloseTo(1.04, 9);
  });

  it("ajouter de l'eau baisse la densité, concentrer l'augmente", () => {
    expect(dilute(1.05, 20, 25)).toBeLessThan(1.05); // dilution
    expect(dilute(1.05, 20, 16)).toBeGreaterThan(1.05); // concentration
  });

  it("v2 ≤ 0 → RangeError (division interdite)", () => {
    expect(() => dilute(1.05, 20, 0)).toThrow(RangeError);
    expect(() => dilute(1.05, 20, -5)).toThrow(/division interdite/);
  });
});

describe("blend — mélange de deux lots (§9.4)", () => {
  it("volumes égaux → moyenne simple des points (1.050 + 1.040 → 1.045)", () => {
    expect(blend(1.05, 10, 1.04, 10)).toBeCloseTo(1.045, 9);
  });

  it("moyenne pondérée par les volumes (30 L à 1.050 + 10 L à 1.040 → 1.0475)", () => {
    expect(points(blend(1.05, 30, 1.04, 10))).toBeCloseTo(47.5, 6);
  });

  it("le mélange reste borné entre les deux densités", () => {
    const mix = blend(1.05, 30, 1.04, 10);
    expect(mix).toBeGreaterThan(1.04);
    expect(mix).toBeLessThan(1.05);
  });

  it("volume total ≤ 0 → RangeError (division interdite)", () => {
    expect(() => blend(1.05, 0, 1.04, 0)).toThrow(RangeError);
    expect(() => blend(1.05, 5, 1.04, -5)).toThrow(/division interdite/);
  });
});
