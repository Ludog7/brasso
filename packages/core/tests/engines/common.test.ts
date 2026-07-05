import { describe, expect, it } from "vitest";

import {
  computeRecipe,
  FOOD_SAFETY_DISCLAIMER,
  gaugeStatus,
  PH_LOW_ACID_THRESHOLD,
  phIndicator,
} from "../../src/engines/index.js";
import type { AltRecipe, BeerRecipe, SoftRecipe } from "../../src/schemas/recipe.js";

describe("gaugeStatus — jauges BJCP", () => {
  it("sans borne → unknown", () => {
    expect(gaugeStatus(5)).toBe("unknown");
  });

  it("below / in_range / above avec bornes", () => {
    expect(gaugeStatus(5, 10, 20)).toBe("below");
    expect(gaugeStatus(15, 10, 20)).toBe("in_range");
    expect(gaugeStatus(25, 10, 20)).toBe("above");
  });

  it("gère une seule borne", () => {
    expect(gaugeStatus(15, 10)).toBe("in_range"); // min seul, au-dessus
    expect(gaugeStatus(5, undefined, 20)).toBe("in_range"); // max seul, en-dessous
    expect(gaugeStatus(25, undefined, 20)).toBe("above"); // max seul, au-dessus
  });
});

describe("phIndicator (ADR-11)", () => {
  it("seuil 4.6 : ≤ 4.6 acidic, > 4.6 low_acid", () => {
    expect(PH_LOW_ACID_THRESHOLD).toBe(4.6);
    expect(phIndicator(4.6).status).toBe("acidic"); // borne incluse côté acide
    expect(phIndicator(4.61).status).toBe("low_acid");
  });

  it("porte le disclaimer imposé, jamais un booléen « conforme »", () => {
    const ind = phIndicator(3.2);
    expect(ind.kind).toBe("indicator");
    expect(ind.threshold).toBe(4.6);
    expect(ind.disclaimer).toBe(FOOD_SAFETY_DISCLAIMER);
    expect(FOOD_SAFETY_DISCLAIMER).toContain("aide à la décision");
  });
});

describe("computeRecipe — dispatcher par engine (ADR-06)", () => {
  const beer: BeerRecipe = {
    engine: "BEER",
    fermentables: [{ potentialSg: 1.037, amountG: 5000, isMashable: true, colorEbc: 7 }],
    hops: [],
    efficiencyPct: 72,
    batchVolumeL: 20,
    boilVolumeL: 24,
    yeastAttenuationPct: 75,
  };
  const alt: AltRecipe = {
    engine: "ALT_FERMENTED",
    og: 1.06,
    fg: 1.012,
    ph: 3.5,
    stabilizationMethod: "THERMAL",
  };
  const soft: SoftRecipe = { engine: "SOFT_DRINK", ph: 3.0 };

  it("route vers le bon moteur", () => {
    expect(computeRecipe(beer).engine).toBe("BEER");
    expect(computeRecipe(alt).engine).toBe("ALT_FERMENTED");
    expect(computeRecipe(soft).engine).toBe("SOFT_DRINK");
  });
});
