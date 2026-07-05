import { describe, expect, it } from "vitest";

import { computeBeer } from "../../src/engines/beer.js";
import { calcAbv } from "../../src/formulas/abv.js";
import { calcColorEbc, ebcToHex } from "../../src/formulas/color.js";
import { boilGravity, calcFg, calcOg } from "../../src/formulas/gravity.js";
import { calcIbu } from "../../src/formulas/ibu.js";
import type { BeerRecipe } from "../../src/schemas/recipe.js";
import { points } from "../../src/units.js";

function baseBeer(over: Partial<BeerRecipe> = {}): BeerRecipe {
  return {
    engine: "BEER",
    fermentables: [{ potentialSg: 1.037, amountG: 5000, isMashable: true, colorEbc: 7 }],
    hops: [{ alphaFraction: 0.06, amountG: 28, timeMin: 60, use: "boil" }],
    efficiencyPct: 72,
    batchVolumeL: 20,
    boilVolumeL: 24,
    yeastAttenuationPct: 75,
    ...over,
  };
}

describe("computeBeer — assemblage des formules (M1-04→07)", () => {
  it("câble OG/FG/ABV/IBU/EBC sur les formules validées", () => {
    const r = baseBeer();
    const og = calcOg(r.fermentables, 72, 20);
    const ogPoints = points(og);
    const fg = calcFg(ogPoints, 75);
    const bg = boilGravity(ogPoints, 20, 24);

    const res = computeBeer(r);
    expect(res.engine).toBe("BEER");
    expect(res.og).toBe(og);
    expect(res.fg).toBe(fg);
    expect(res.abv).toBe(calcAbv(og, fg));
    expect(res.ibu).toBe(calcIbu(r.hops, bg, 20));
    expect(res.ebc).toBe(calcColorEbc(r.fermentables, 20));
    expect(res.colorHex).toBe(ebcToHex(res.ebc));
  });

  it("valeurs de contrôle : OG ≈ 1.0067, EBC ≈ 10.8 (cohérent M1-04/07)", () => {
    const res = computeBeer(baseBeer());
    expect(res.og).toBeCloseTo(1.00666, 4);
    expect(res.ebc).toBeCloseTo(10.77, 1);
  });

  it("jauges BJCP : in_range / below / above selon la plage du style", () => {
    const res = computeBeer(
      baseBeer({ style: { ogMin: 1.005, ogMax: 1.01, ibuMin: 1000, ebcMax: 5 } }),
    );
    expect(res.bjcp.og).toBe("in_range"); // 1.0067 ∈ [1.005, 1.010]
    expect(res.bjcp.ibu).toBe("below"); // ibu < 1000
    expect(res.bjcp.ebc).toBe("above"); // 10.8 > 5
  });

  it("sans style → jauges 'unknown'", () => {
    const res = computeBeer(baseBeer());
    expect(res.bjcp).toEqual({ og: "unknown", fg: "unknown", ibu: "unknown", ebc: "unknown" });
  });

  it("recette BEER publiable côté core (contrôles en M2)", () => {
    expect(computeBeer(baseBeer()).publication).toEqual({ publishable: true, errors: [] });
  });
});
