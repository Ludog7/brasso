import { describe, expect, it } from "vitest";

import { computeSoftDrink } from "../../src/engines/softDrink.js";
import type { SoftRecipe } from "../../src/schemas/recipe.js";

function baseSoft(over: Partial<SoftRecipe> = {}): SoftRecipe {
  return {
    engine: "SOFT_DRINK",
    sugarConcentrationGPerL: 100,
    ph: 3.0,
    storageMode: "cold",
    ...over,
  };
}

describe("computeSoftDrink — pas d'ABV/IBU, pH + stabilisation", () => {
  it("expose le sucre et le pH, pas d'ABV/IBU/EBC", () => {
    const res = computeSoftDrink(baseSoft());
    expect(res.sugarConcentrationGPerL).toBe(100);
    expect(res.ph?.status).toBe("acidic");
    expect(res).not.toHaveProperty("abv");
    expect(res).not.toHaveProperty("ibu");
    expect(res).not.toHaveProperty("ebc");
  });

  it("valeurs par défaut : sucre/pH/storageMode absents → null", () => {
    const res = computeSoftDrink({ engine: "SOFT_DRINK" });
    expect(res.sugarConcentrationGPerL).toBeNull();
    expect(res.ph).toBeNull();
    expect(res.storageMode).toBeNull();
  });

  it("stabilisation requise : stockage ambiant à pH > 4.6", () => {
    expect(computeSoftDrink(baseSoft({ storageMode: "cold", ph: 5 })).stabilizationRequired).toBe(
      false,
    );
    expect(
      computeSoftDrink(baseSoft({ storageMode: "ambient", ph: 3 })).stabilizationRequired,
    ).toBe(false);
    expect(
      computeSoftDrink(baseSoft({ storageMode: "ambient", ph: 5 })).stabilizationRequired,
    ).toBe(true);
  });

  it("publication : pH obligatoire", () => {
    expect(computeSoftDrink(baseSoft()).publication.publishable).toBe(true);
    const noPh = computeSoftDrink(baseSoft({ ph: undefined }));
    expect(noPh.publication.publishable).toBe(false);
    expect(noPh.publication.errors.join(" ")).toContain("pH obligatoire");
  });

  it("publication : stabilisation requise bloque, sauf si fournie", () => {
    const blocked = computeSoftDrink(baseSoft({ storageMode: "ambient", ph: 5 }));
    expect(blocked.publication.publishable).toBe(false);
    expect(blocked.publication.errors.join(" ")).toContain("Stabilisation requise");

    const ok = computeSoftDrink(
      baseSoft({ storageMode: "ambient", ph: 5, stabilizationMethod: "PASTEURIZATION" }),
    );
    expect(ok.stabilizationRequired).toBe(true);
    expect(ok.publication.publishable).toBe(true);
  });
});
