import { describe, expect, it } from "vitest";

import {
  calcColorEbc,
  type ColorFermentable,
  EBC_HEX_ANCHORS,
  ebcToHex,
  MOREY_COEFFICIENT,
  MOREY_EXPONENT,
} from "../../src/formulas/color.js";

describe("coefficients de Morey (§5)", () => {
  it("figent les valeurs du référentiel", () => {
    expect(MOREY_COEFFICIENT).toBe(1.4922);
    expect(MOREY_EXPONENT).toBe(0.6859);
  });
});

describe("calcColorEbc — Morey (§5)", () => {
  it("validation : 5 kg Pale (7 EBC) dans 20 L → ≈11 EBC (ambré clair)", () => {
    // Morey fidèle (colorEbc → ebcToLovibond) : 10.77 EBC, soit ≈11 — borne basse de
    // la cible ≈11-12 du doc (l'annotation « ≈3,5 °L » est une approximation de 3,18).
    const ebc = calcColorEbc([{ colorEbc: 7, amountG: 5000 }], 20);
    expect(ebc).toBeCloseTo(10.77, 1);
    expect(ebc).toBeGreaterThan(10);
    expect(ebc).toBeLessThan(12);
  });

  it("additionne les MCU de plusieurs fermentescibles", () => {
    const pale: ColorFermentable = { colorEbc: 7, amountG: 4000 };
    const crystal: ColorFermentable = { colorEbc: 120, amountG: 500 };
    const total = calcColorEbc([pale, crystal], 20);
    // Ajouter un malt coloré assombrit toujours par rapport au pale seul.
    expect(total).toBeGreaterThan(calcColorEbc([pale], 20));
  });

  it("grist vide → 0 EBC (moût incolore)", () => {
    expect(calcColorEbc([], 20)).toBe(0);
  });

  it("plus le volume est grand, plus la couleur est diluée", () => {
    const grist: ColorFermentable[] = [{ colorEbc: 7, amountG: 5000 }];
    expect(calcColorEbc(grist, 40)).toBeLessThan(calcColorEbc(grist, 20));
  });

  it("batchVolumeL ≤ 0 → RangeError (division interdite)", () => {
    expect(() => calcColorEbc([{ colorEbc: 7, amountG: 5000 }], 0)).toThrow(RangeError);
    expect(() => calcColorEbc([{ colorEbc: 7, amountG: 5000 }], -20)).toThrow(/division interdite/);
  });
});

describe("ebcToHex — pastille couleur (Annexe A)", () => {
  it("reproduit exactement les couleurs d'ancre", () => {
    expect(ebcToHex(2)).toBe("#FBE68B");
    expect(ebcToHex(4)).toBe("#F3CA00");
    expect(ebcToHex(12)).toBe("#D07000");
    expect(ebcToHex(80)).toBe("#1A0A00");
  });

  it("interpole linéairement entre deux ancres (6 EBC entre 4 et 8)", () => {
    // #F3CA00 (243,202,0) ↔ #E08A00 (224,138,0), t=0.5 → (234,170,0) = #EAAA00.
    expect(ebcToHex(6)).toBe("#EAAA00");
  });

  it("interpole aussi dans le haut du spectre (70 EBC entre 60 et 80)", () => {
    expect(ebcToHex(70)).toBe("#280C00");
  });

  it("borne aux extrêmes hors plage (≤2 et ≥80)", () => {
    expect(ebcToHex(0)).toBe("#FBE68B");
    expect(ebcToHex(-5)).toBe("#FBE68B");
    expect(ebcToHex(100)).toBe("#1A0A00");
  });

  it("renvoie toujours un hex #RRGGBB valide", () => {
    for (const anchor of EBC_HEX_ANCHORS) {
      expect(ebcToHex(anchor.ebc)).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(ebcToHex(25)).toMatch(/^#[0-9A-F]{6}$/);
  });
});
