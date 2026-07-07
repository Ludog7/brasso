import type { BjcpStyle } from "@brasso/core";
import { computeBeer } from "@brasso/core";
import { describe, expect, it } from "vitest";

import {
  type BeerFormState,
  emptyHop,
  emptyMalt,
  emptySugar,
  emptyYeast,
  toBeerRecipe,
} from "@/features/recipes/beer/mapToEngine";

/** État d'édition de référence : 5 kg Pale (7 EBC), 28 g houblon 6 % 60 min, 20 L. */
function referenceState(over: Partial<BeerFormState> = {}): BeerFormState {
  return {
    name: "IPA de référence",
    description: "",
    styleCode: "",
    batchVolumeL: "20",
    boilTimeMin: "60",
    efficiencyPct: "72",
    malts: [{ ...emptyMalt(), name: "Pale", amountG: "5000", colorEbc: "7", potentialSg: "1.037" }],
    sugars: [],
    hops: [
      { ...emptyHop(), name: "Cascade", amountG: "28", alphaPct: "6", timeMin: "60", use: "BOIL" },
    ],
    yeasts: [{ ...emptyYeast(), name: "US-05", attenuationPct: "75" }],
    adjuncts: [],
    steps: [],
    ...over,
  };
}

describe("toBeerRecipe — projection éditeur → moteur", () => {
  it("reprojette les intrants vers l'entrée pure de computeBeer", () => {
    expect(toBeerRecipe(referenceState())).toEqual({
      engine: "BEER",
      fermentables: [{ potentialSg: 1.037, amountG: 5000, isMashable: true, colorEbc: 7 }],
      hops: [{ alphaFraction: 0.06, amountG: 28, timeMin: 60, use: "boil" }],
      efficiencyPct: 72,
      batchVolumeL: 20,
      boilVolumeL: 20,
      yeastAttenuationPct: 75,
    });
  });

  it("les sucres entrent comme fermentescibles non empâtés (100 %)", () => {
    const state = referenceState({
      sugars: [{ ...emptySugar(), name: "Dextrose", amountG: "500", potentialSg: "1.037" }],
    });
    const { fermentables } = toBeerRecipe(state);
    expect(fermentables).toContainEqual({
      potentialSg: 1.037,
      amountG: 500,
      isMashable: false,
      colorEbc: 0,
    });
  });

  it("valeurs de référence FORMULES via computeBeer (OG ≈ 1.0067, EBC ≈ 10.8)", () => {
    const res = computeBeer(toBeerRecipe(referenceState()));
    expect(res.og).toBeCloseTo(1.00666, 4);
    expect(res.ebc).toBeCloseTo(10.77, 1);
  });

  it("jauges BJCP correctes selon la plage du style", () => {
    const style: BjcpStyle = {
      code: "T",
      name: "Test",
      category: "Test",
      ogMin: 1.05,
      ogMax: 1.06,
      fgMin: 1.0,
      fgMax: 1.02,
      ibuMin: 1000,
      ibuMax: 2000,
      ebcMin: 0,
      ebcMax: 5,
    };
    const res = computeBeer(toBeerRecipe(referenceState(), style));
    expect(res.bjcp.og).toBe("below"); // 1.0067 < 1.05
    expect(res.bjcp.ibu).toBe("below"); // très en dessous
    expect(res.bjcp.ebc).toBe("above"); // 10.77 > 5
  });

  it("volume ≤ 0 → recette non calculable (garde du panneau)", () => {
    const recipe = toBeerRecipe(referenceState({ batchVolumeL: "" }));
    expect(recipe.batchVolumeL).toBe(0);
  });
});
