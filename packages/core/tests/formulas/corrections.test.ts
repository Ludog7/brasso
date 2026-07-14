import { describe, expect, it } from "vitest";

import {
  type PreBoilCorrectionInput,
  suggestPreBoilCorrections,
} from "../../src/formulas/corrections.js";

/**
 * Cas de référence, calculés à la main (FORMULES §1/§2/§3/§9.3). Volume mesuré =
 * volume pré-ébullition cible (30 L) pour lever toute ambiguïté ; évaporation 4 L/h
 * sur 60 min = 4 L → volume final planifié 26 L.
 */
const BASE: PreBoilCorrectionInput = {
  measuredGravity: 1.036,
  measuredVolumeL: 30,
  targetPreBoilGravity: 1.04,
  targetPreBoilVolumeL: 30,
  targetOg: 1.05,
  evaporationRateLPerHour: 4,
  plannedBoilTimeMin: 60,
  expectedAttenuationPct: 75,
};

describe("suggestPreBoilCorrections — densité basse (§9.3 concentration / §1 sucre)", () => {
  it("écarts : −4 points pré-ébullition, OG projetée sous la cible", () => {
    const { deltaGravity, deltaOg } = suggestPreBoilCorrections(BASE);
    // points(1.036) − points(1.040) = 36 − 40 = −4.
    expect(deltaGravity).toBeCloseTo(-4, 9);
    // measuredPoints = 36×30 = 1080 ; volume final 26 → OG 1080/26 = 41.538 pts ; −50 = −8.462.
    expect(deltaOg).toBeCloseTo(-8.461538, 5);
  });

  it("prolonger l'ébullition : 66 min de plus amènent l'OG à la cible", () => {
    const { proposals } = suggestPreBoilCorrections(BASE);
    const extend = proposals.find((p) => p.kind === "extend_boil");
    // targetVolume = 1080/50 = 21.6 L ; extraEvap = 26 − 21.6 = 4.4 L ; 4.4/4 × 60 = 66 min.
    expect(extend).toBeDefined();
    expect(extend).toMatchObject({ kind: "extend_boil" });
    if (extend?.kind === "extend_boil") {
      expect(extend.extraBoilMin).toBeCloseTo(66, 6);
      expect(extend.projectedOg).toBeCloseTo(1.05, 6);
      // FG = 50×0.25 = 12.5 pts → 1.0125 ; ABV = (1.050−1.0125)×131.25 = 4.921875 %.
      expect(extend.projectedAbv).toBeCloseTo(4.921875, 5);
    }
  });

  it("ajouter du sucre : ~4.78 kg (base saccharose 46 pts/kg/L) amènent l'OG à la cible", () => {
    const { proposals } = suggestPreBoilCorrections(BASE);
    const sugar = proposals.find((p) => p.kind === "add_sugar");
    // déficit = 50×26 − 1080 = 220 pts·L ; /46 = 4.782609 kg.
    expect(sugar).toBeDefined();
    if (sugar?.kind === "add_sugar") {
      expect(sugar.sugarKg).toBeCloseTo(4.782609, 5);
      expect(sugar.projectedOg).toBeCloseTo(1.05, 6);
      expect(sugar.projectedAbv).toBeCloseTo(4.921875, 5);
    }
  });

  it("les deux options visent la même OG cible et sont ordonnées [ébullition, sucre]", () => {
    const { proposals } = suggestPreBoilCorrections(BASE);
    expect(proposals.map((p) => p.kind)).toEqual(["extend_boil", "add_sugar"]);
    for (const p of proposals) expect(p.projectedOg).toBeCloseTo(1.05, 6);
  });

  it("plus la densité est basse, plus il faut de sucre (monotone)", () => {
    const sugarFor = (gravity: number): number => {
      const p = suggestPreBoilCorrections({ ...BASE, measuredGravity: gravity }).proposals.find(
        (x) => x.kind === "add_sugar",
      );
      return p?.kind === "add_sugar" ? p.sugarKg : Number.NaN;
    };
    expect(sugarFor(1.03)).toBeGreaterThan(sugarFor(1.038));
  });

  it("déterministe : mêmes entrées → même résultat (reproductible)", () => {
    expect(suggestPreBoilCorrections(BASE)).toEqual(suggestPreBoilCorrections(BASE));
  });
});

describe("suggestPreBoilCorrections — densité haute (§9.3 dilution)", () => {
  const HIGH: PreBoilCorrectionInput = { ...BASE, measuredGravity: 1.048 };

  it("écart positif → une seule proposition : diluer", () => {
    const { deltaGravity, proposals } = suggestPreBoilCorrections(HIGH);
    expect(deltaGravity).toBeCloseTo(8, 9); // 48 − 40
    expect(proposals.map((p) => p.kind)).toEqual(["dilute"]);
  });

  it("dilution : +6 L d'eau ramènent la densité pré-ébullition à la cible", () => {
    const dilute = suggestPreBoilCorrections(HIGH).proposals[0];
    // measuredPoints = 48×30 = 1440 ; volume cible = 1440/40 = 36 L ; eau = 36 − 30 = 6 L.
    expect(dilute).toMatchObject({ kind: "dilute" });
    if (dilute?.kind === "dilute") {
      expect(dilute.waterToAddL).toBeCloseTo(6, 6);
      // Après dilution (36 L) puis ébullition planifiée (−4 L) → 32 L : OG 1440/32 = 45 pts = 1.045.
      expect(dilute.projectedOg).toBeCloseTo(1.045, 6);
      // FG = 45×0.25 = 11.25 pts → 1.01125 ; ABV = (1.045−1.01125)×131.25 = 4.4296875 %.
      expect(dilute.projectedAbv).toBeCloseTo(4.4296875, 5);
    }
  });

  it("densité mesurée = cible → dilution informative de 0 L", () => {
    const { proposals } = suggestPreBoilCorrections({ ...BASE, measuredGravity: 1.04 });
    expect(proposals[0]).toMatchObject({ kind: "dilute" });
    if (proposals[0]?.kind === "dilute") expect(proposals[0].waterToAddL).toBeCloseTo(0, 9);
  });
});

describe("suggestPreBoilCorrections — cas limites & garde-fous", () => {
  it("densité basse mais volume excédentaire → aucune correction à la hausse", () => {
    // 36 pts × 40 L = 1440 pts·L : l'extrait dépasse déjà la cible au volume final.
    const { proposals } = suggestPreBoilCorrections({ ...BASE, measuredVolumeL: 40 });
    expect(proposals).toHaveLength(0);
  });

  it("dilution avec volume final non atteignable → OG projetée retombe sur l'état courant", () => {
    // Cas volontairement extrême pour couvrir le repli (évaporation ≥ volume dilué).
    const proposal = suggestPreBoilCorrections({
      measuredGravity: 1.05,
      measuredVolumeL: 1,
      targetPreBoilGravity: 1.04,
      targetPreBoilVolumeL: 200,
      targetOg: 1.05,
      evaporationRateLPerHour: 60,
      plannedBoilTimeMin: 60,
      expectedAttenuationPct: 75,
    }).proposals[0];
    expect(proposal).toMatchObject({ kind: "dilute" });
    if (proposal?.kind === "dilute") {
      expect(proposal.waterToAddL).toBeCloseTo(0.25, 6); // 1.25 − 1
      expect(Number.isFinite(proposal.projectedOg)).toBe(true);
    }
  });

  it("entrées invalides → RangeError", () => {
    expect(() => suggestPreBoilCorrections({ ...BASE, measuredVolumeL: 0 })).toThrow(RangeError);
    expect(() => suggestPreBoilCorrections({ ...BASE, evaporationRateLPerHour: 0 })).toThrow(
      RangeError,
    );
    expect(() => suggestPreBoilCorrections({ ...BASE, targetOg: 1 })).toThrow(RangeError);
    expect(() => suggestPreBoilCorrections({ ...BASE, targetPreBoilGravity: 1 })).toThrow(
      RangeError,
    );
    // Évaporation planifiée (≥ volume pré-ébullition) → volume final ≤ 0.
    expect(() =>
      suggestPreBoilCorrections({ ...BASE, evaporationRateLPerHour: 40, plannedBoilTimeMin: 60 }),
    ).toThrow(/volume final/);
  });
});
