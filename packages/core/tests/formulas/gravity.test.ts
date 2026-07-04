import { describe, expect, it, vi } from "vitest";

import {
  ATTENUATION_MAX_PCT,
  ATTENUATION_MIN_PCT,
  boilGravity,
  calcFg,
  calcOg,
  EFFICIENCY_MAX_PCT,
  EFFICIENCY_MIN_PCT,
} from "../../src/formulas/gravity.js";
import { points } from "../../src/units.js";

// Grist de contrôle : 5 kg de malt Pale (potentiel 1.037 → 37 points/kg/L, §1.2),
// empâté. À 72 % de rendement dans 20 L : contrib = 37 × 5 × 0.72 = 133.2 points·L,
// OG_points = 133.2 / 20 = 6.66 → OG = 1.00666 (arithmétique exacte du §1).
const PALE_5KG = [{ potentialSg: 1.037, amountG: 5000, isMashable: true }];

describe("bornes de plausibilité (Annexe / §1.3, §2)", () => {
  it("figent les plages de rendement et d'atténuation", () => {
    expect(EFFICIENCY_MIN_PCT).toBe(50);
    expect(EFFICIENCY_MAX_PCT).toBe(95);
    expect(ATTENUATION_MIN_PCT).toBe(50);
    expect(ATTENUATION_MAX_PCT).toBe(95);
  });
});

describe("calcOg — densité initiale (§1)", () => {
  it("cas documenté : 5 kg Pale, 72 %, 20 L → OG_points 6.66 / OG 1.00666", () => {
    const og = calcOg(PALE_5KG, 72, 20);
    expect(points(og)).toBeCloseTo(6.66, 6);
    expect(og).toBeCloseTo(1.00666, 6);
  });

  it("le rendement ne s'applique pas aux sucres/extraits (isMashable=false)", () => {
    // 1 kg de sucre à 46 points dans 1 L, non empâté : eff ignoré → OG 1.046.
    const sugar = [{ potentialSg: 1.046, amountG: 1000, isMashable: false }];
    expect(calcOg(sugar, 60, 1)).toBeCloseTo(1.046, 9);
  });

  it("le rendement s'applique aux grains empâtés", () => {
    // Même potentiel/masse (40 points, 1 kg, 1 L) : empâté à 50 % = moitié du non-empâté.
    const grain = { potentialSg: 1.04, amountG: 1000 };
    expect(calcOg([{ ...grain, isMashable: true }], 50, 1)).toBeCloseTo(1.02, 9);
    expect(calcOg([{ ...grain, isMashable: false }], 50, 1)).toBeCloseTo(1.04, 9);
  });

  it("additionne les contributions de plusieurs fermentescibles", () => {
    const grist = [
      { potentialSg: 1.037, amountG: 4000, isMashable: true },
      { potentialSg: 1.046, amountG: 500, isMashable: false }, // sucre à 100 %
    ];
    // (37×4×0.72 + 46×0.5×1) / 20 = (106.56 + 23) / 20 = 6.478 points
    expect(points(calcOg(grist, 72, 20))).toBeCloseTo(6.478, 6);
  });

  it("grist vide → OG 1.000 (§1.3)", () => {
    expect(calcOg([], 72, 20)).toBe(1);
  });

  it("batchVolumeL ≤ 0 → RangeError (division interdite, §1.3)", () => {
    expect(() => calcOg(PALE_5KG, 72, 0)).toThrow(RangeError);
    expect(() => calcOg(PALE_5KG, 72, -5)).toThrow(/division interdite/);
  });

  it("rendement hors plage → borné + avertissement", () => {
    const warn = vi.fn();
    // eff 120 → borné à 95 : contrib = 37 × 5 × 0.95 / 20 = 8.7875 points.
    const og = calcOg(PALE_5KG, 120, 20, warn);
    expect(points(og)).toBeCloseTo(8.7875, 6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("efficiencyPct"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("hors plage"));
  });

  it("rendement trop bas → borné à la borne basse", () => {
    const warn = vi.fn();
    // eff 40 → borné à 50 : contrib = 37 × 5 × 0.50 / 20 = 4.625 points.
    expect(points(calcOg(PALE_5KG, 40, 20, warn))).toBeCloseTo(4.625, 6);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("borne sans callback : pas d'erreur, valeur bornée", () => {
    // eff 200 sans warn → borné à 95, aucune exception.
    expect(points(calcOg(PALE_5KG, 200, 20))).toBeCloseTo(8.7875, 6);
  });

  it("rendement dans la plage → aucun avertissement", () => {
    const warn = vi.fn();
    calcOg(PALE_5KG, 72, 20, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("calcFg — densité finale (§2)", () => {
  it("cas cohérent avec l'OG de contrôle : OG_points 6.66 à 75 % → FG 1.001665", () => {
    const fg = calcFg(6.66, 75);
    expect(points(fg)).toBeCloseTo(1.665, 9);
    expect(fg).toBeCloseTo(1.001665, 9);
  });

  it("FG < OG (l'atténuation retire des points)", () => {
    const ogPoints = 52; // OG 1.052
    const fg = calcFg(ogPoints, 78);
    expect(points(fg)).toBeLessThan(ogPoints);
  });

  it("atténuation hors plage → bornée + avertissement", () => {
    const warn = vi.fn();
    // attén 120 → bornée à 95 : FG_points = 52 × (1 − 0.95) = 2.6.
    expect(points(calcFg(52, 120, warn))).toBeCloseTo(2.6, 9);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("attenuationPct"));
  });

  it("atténuation dans la plage → aucun avertissement", () => {
    const warn = vi.fn();
    calcFg(52, 75, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("boilGravity — densité en ébullition (§4.2)", () => {
  it("cas documenté : OG_points 40, batch 20 L, boil 16 L → 1.050", () => {
    // 40 × 20 / 16 = 50 points → 1.050 (moût concentré avant ébullition).
    expect(boilGravity(40, 20, 16)).toBeCloseTo(1.05, 9);
  });

  it("volume d'ébullition égal au batch → boil gravity = OG", () => {
    expect(boilGravity(50, 20, 20)).toBeCloseTo(1.05, 9);
  });

  it("volume d'ébullition < batch → moût plus concentré que l'OG", () => {
    expect(boilGravity(50, 20, 16)).toBeGreaterThan(1.05);
  });

  it("boilVolumeL ≤ 0 → RangeError (division interdite, §4.2)", () => {
    expect(() => boilGravity(50, 20, 0)).toThrow(RangeError);
    expect(() => boilGravity(50, 20, -1)).toThrow(/division interdite/);
  });
});

describe("composition OG → FG / boilGravity via points() (§11)", () => {
  it("points(calcOg) alimente calcFg et boilGravity", () => {
    const og = calcOg(PALE_5KG, 72, 20);
    const ogPoints = points(og);
    // FG cohérente et strictement inférieure à l'OG.
    expect(calcFg(ogPoints, 75)).toBeLessThan(og);
    // boilGravity avec volumes égaux reconstitue l'OG.
    expect(boilGravity(ogPoints, 20, 20)).toBeCloseTo(og, 9);
  });
});
