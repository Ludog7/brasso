import { describe, expect, it } from "vitest";

import {
  infusionVolume,
  mashWaterVolume,
  spargeVolume,
  strikeWaterTemp,
  WATER_BOILING_C,
} from "../../src/formulas/mash.js";

describe("mashWaterVolume — eau d'empâtage (§6.1)", () => {
  it("ratio × grain (5 kg à 3 L/kg → 15 L)", () => {
    expect(mashWaterVolume(5, 3)).toBe(15);
  });

  it("ratio par défaut = 3.0 L/kg", () => {
    expect(mashWaterVolume(5)).toBe(15);
    expect(mashWaterVolume(4, 2.5)).toBe(10);
  });
});

describe("strikeWaterTemp — eau de chauffe (§6.3)", () => {
  it("ratio 3, cible 66 °C, grain 20 °C → ≈72.3 °C (plausible, > cible)", () => {
    const t = strikeWaterTemp(3, 66, 20);
    expect(t).toBeCloseTo(72.29, 2);
    expect(t).toBeGreaterThan(66);
  });

  it("grain plus froid → eau de chauffe plus chaude", () => {
    expect(strikeWaterTemp(3, 66, 10)).toBeGreaterThan(strikeWaterTemp(3, 66, 20));
  });

  it("ratio ≤ 0 → RangeError (division interdite)", () => {
    expect(() => strikeWaterTemp(0, 66, 20)).toThrow(RangeError);
    expect(() => strikeWaterTemp(-3, 66, 20)).toThrow(/division interdite/);
  });
});

describe("spargeVolume — eau de rinçage (§6.2)", () => {
  it("volPreBoil + absorption + dead space − eau d'empâtage", () => {
    // 27 + (1.0 × 5) + 1 − 15 = 18 L.
    expect(spargeVolume(27, 5, 15, 1)).toBe(18);
  });

  it("dead space par défaut = 0", () => {
    expect(spargeVolume(27, 5, 15)).toBe(17);
  });

  it("l'absorption de la drêche augmente le rinçage nécessaire", () => {
    expect(spargeVolume(27, 6, 15)).toBeGreaterThan(spargeVolume(27, 5, 15));
  });
});

describe("infusionVolume — correction de palier (§6.4)", () => {
  it("50 → 66 °C, 5 kg grain, 15 L d'eau → ≈8.02 L d'eau bouillante", () => {
    expect(infusionVolume(66, 50, 5, 15)).toBeCloseTo(8.02, 2);
  });

  it("température d'infusion par défaut = eau bouillante (100 °C)", () => {
    expect(WATER_BOILING_C).toBe(100);
    expect(infusionVolume(66, 50, 5, 15)).toBe(infusionVolume(66, 50, 5, 15, 100));
  });

  it("un plus grand écart de palier demande plus d'eau", () => {
    expect(infusionVolume(72, 50, 5, 15)).toBeGreaterThan(infusionVolume(66, 50, 5, 15));
  });

  it("boilingC ≤ targetC → RangeError (infusion impossible)", () => {
    expect(() => infusionVolume(100, 66, 5, 15)).toThrow(RangeError);
    expect(() => infusionVolume(66, 50, 5, 15, 60)).toThrow(/infusion impossible/);
  });
});
