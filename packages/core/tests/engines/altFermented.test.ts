import { describe, expect, it } from "vitest";

import { computeAltFermented } from "../../src/engines/altFermented.js";
import { calcAbv } from "../../src/formulas/abv.js";
import { residualCo2 } from "../../src/formulas/carbonation.js";
import { realAttenuation } from "../../src/formulas/postmortem.js";
import type { AltRecipe } from "../../src/schemas/recipe.js";

function baseAlt(over: Partial<AltRecipe> = {}): AltRecipe {
  return {
    engine: "ALT_FERMENTED",
    og: 1.06,
    fg: 1.012,
    ph: 3.5,
    stabilizationMethod: "THERMAL",
    storageMode: "ambient",
    ...over,
  };
}

describe("computeAltFermented — ABV/atténuation + garde-fous", () => {
  it("câble ABV et atténuation, sans IBU/EBC", () => {
    const res = computeAltFermented(baseAlt());
    expect(res.abv).toBe(calcAbv(1.06, 1.012));
    expect(res.attenuation).toBe(realAttenuation(1.06, 1.012));
    expect(res).not.toHaveProperty("ibu");
    expect(res).not.toHaveProperty("ebc");
  });

  it("indicateur pH (ADR-11) : acidic ≤ 4.6, low_acid > 4.6, jamais « conforme »", () => {
    expect(computeAltFermented(baseAlt({ ph: 3.5 })).ph?.status).toBe("acidic");
    expect(computeAltFermented(baseAlt({ ph: 5.0 })).ph?.status).toBe("low_acid");
    const ind = computeAltFermented(baseAlt()).ph;
    expect(ind?.kind).toBe("indicator");
    expect(ind?.disclaimer).toContain("Indicateur d'aide à la décision");
  });

  it("pH absent → indicateur null", () => {
    expect(computeAltFermented(baseAlt({ ph: undefined })).ph).toBeNull();
  });

  it("risque de carbonatation : CO₂ résiduel si maxTempC, sinon null", () => {
    expect(computeAltFermented(baseAlt({ maxTempC: 20 })).carbonationRisk.residualCo2).toBe(
      residualCo2(20),
    );
    expect(computeAltFermented(baseAlt()).carbonationRisk.residualCo2).toBeNull();
  });

  it("atRisk = sucre résiduel + non stabilisé + ambiant", () => {
    const risky = computeAltFermented(
      baseAlt({ residualSugarRisk: true, stabilizationMethod: null, storageMode: "ambient" }),
    );
    expect(risky.carbonationRisk.atRisk).toBe(true);
    // stabilisé → plus de risque
    expect(
      computeAltFermented(baseAlt({ residualSugarRisk: true, stabilizationMethod: "THERMAL" }))
        .carbonationRisk.atRisk,
    ).toBe(false);
    // froid → plus de risque
    expect(
      computeAltFermented(
        baseAlt({ residualSugarRisk: true, stabilizationMethod: null, storageMode: "cold" }),
      ).carbonationRisk.atRisk,
    ).toBe(false);
  });

  it("publication : stabilisation ET pH obligatoires (ADR-06)", () => {
    expect(computeAltFermented(baseAlt()).publication).toEqual({ publishable: true, errors: [] });

    const noStab = computeAltFermented(baseAlt({ stabilizationMethod: null }));
    expect(noStab.publication.publishable).toBe(false);
    expect(noStab.publication.errors.join(" ")).toContain("Stabilisation obligatoire");

    const noPh = computeAltFermented(baseAlt({ ph: undefined }));
    expect(noPh.publication.publishable).toBe(false);
    expect(noPh.publication.errors.join(" ")).toContain("pH obligatoire");
  });
});
