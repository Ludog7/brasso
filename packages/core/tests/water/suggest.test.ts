import { describe, expect, it } from "vitest";

import {
  SALT_ION_PPM,
  suggestWaterAdditions,
  sulfateChlorideRatio,
  type WaterProfileIons,
} from "../../src/index.js";

/** Eau osmosée (RO) : tous ions à 0. */
const RO: Partial<WaterProfileIons> = {};

/** Norme L2 d'un écart ionique (mg/L). */
function ionNorm(delta: WaterProfileIons): number {
  return Math.sqrt(Object.values(delta).reduce((sum, value) => sum + value * value, 0));
}

describe("SALT_ION_PPM — apports ioniques (Annexe D.2)", () => {
  it("correspond aux valeurs de référence dérivées des masses molaires", () => {
    expect(SALT_ION_PPM.gypsum.calcium).toBeCloseTo(232.8, 1);
    expect(SALT_ION_PPM.gypsum.sulfate).toBeCloseTo(557.9, 1);
    expect(SALT_ION_PPM.calciumChloride.chloride).toBeCloseTo(482.3, 1);
    expect(SALT_ION_PPM.bakingSoda.bicarbonate).toBeCloseTo(726.3, 1);
  });
});

describe("sulfateChlorideRatio — indicateur d'équilibre", () => {
  it("SO₄/Cl calculé, null si chlorure nul", () => {
    expect(sulfateChlorideRatio({ sulfate: 200, chloride: 100 })).toBe(2);
    expect(sulfateChlorideRatio({ sulfate: 150, chloride: 0 })).toBeNull();
  });
});

describe("suggestWaterAdditions — sels indicatifs (Annexe D.3, ADR-11)", () => {
  it("round-trip d'une cible atteignable : retrouve les doses connues (résidu ≈ 0)", () => {
    // Cible = RO + 6 g gypse + 4 g CaCl₂ dans 20 L (valeurs Annexe D.3).
    const target = { calcium: 124.361, sulfate: 167.382, chloride: 96.458 };
    const s = suggestWaterAdditions(RO, target, 20);

    expect(s.additionsG.gypsum).toBeCloseTo(6, 1);
    expect(s.additionsG.calciumChloride).toBeCloseTo(4, 1);
    expect(s.additionsG.epsom).toBeCloseTo(0, 1);
    expect(s.additionsG.tableSalt).toBeCloseTo(0, 1);
    expect(s.additionsG.bakingSoda).toBeCloseTo(0, 1);

    // Résidu quasi nul sur chaque ion.
    for (const value of Object.values(s.residualDelta)) {
      expect(value).toBeCloseTo(0, 2);
    }
    // Ratio SO₄/Cl du profil obtenu ≈ 1.74.
    expect(s.sulfateChlorideRatio).toBeCloseTo(1.735, 2);
  });

  it("les doses sont proportionnelles au volume, le profil obtenu ne l'est pas", () => {
    const target = { calcium: 120, sulfate: 250, chloride: 60 };
    const s20 = suggestWaterAdditions(RO, target, 20);
    const s40 = suggestWaterAdditions(RO, target, 40);

    expect(s40.additionsG.gypsum).toBeCloseTo(s20.additionsG.gypsum * 2, 6);
    expect(s40.additionsG.calciumChloride).toBeCloseTo(s20.additionsG.calciumChloride * 2, 6);
    // Concentrations (mg/L) indépendantes du volume.
    expect(s40.achievedProfile.sulfate).toBeCloseTo(s20.achievedProfile.sulfate, 6);
  });

  it("cible non atteignable : ne fait jamais pire que ne rien ajouter (minimisation)", () => {
    const base = {
      calcium: 40,
      magnesium: 10,
      sodium: 15,
      sulfate: 30,
      chloride: 20,
      bicarbonate: 100,
    };
    // Profil « IPA » riche en sulfate.
    const target = {
      calcium: 120,
      magnesium: 10,
      sodium: 15,
      sulfate: 250,
      chloride: 60,
      bicarbonate: 100,
    };
    const s = suggestWaterAdditions(base, target, 20);

    // Écart initial (sans ajout) = base − cible.
    const initial = ionNorm({
      calcium: base.calcium - target.calcium,
      magnesium: 0,
      sodium: 0,
      sulfate: base.sulfate - target.sulfate,
      chloride: base.chloride - target.chloride,
      bicarbonate: 0,
    });
    expect(ionNorm(s.residualDelta)).toBeLessThanOrEqual(initial + 1e-9);
    // Le gypse est l'ajout dominant d'un profil sulfaté.
    expect(s.additionsG.gypsum).toBeGreaterThan(0);
    expect(s.sulfateChlorideRatio).not.toBeNull();
  });

  it("base déjà au-dessus de la cible : aucun sel ajouté (contrainte de positivité)", () => {
    const base = {
      calcium: 200,
      magnesium: 50,
      sodium: 100,
      sulfate: 400,
      chloride: 300,
      bicarbonate: 150,
    };
    const s = suggestWaterAdditions(base, RO, 20);
    for (const dose of Object.values(s.additionsG)) {
      expect(dose).toBeCloseTo(0, 6);
    }
    // Sans ajout, le profil obtenu = la base.
    expect(s.achievedProfile.sulfate).toBeCloseTo(400, 6);
  });

  it("rejette un volume non strictement positif", () => {
    expect(() => suggestWaterAdditions(RO, RO, 0)).toThrow(RangeError);
    expect(() => suggestWaterAdditions(RO, RO, -5)).toThrow(RangeError);
  });
});
