import { describe, expect, it } from "vitest";

import {
  ALT_PH_REQUIRED,
  ALT_STABILIZATION_REQUIRED,
  recipePublicationCheck,
  SOFT_PH_REQUIRED,
  SOFT_STABILIZATION_REQUIRED,
} from "../../src/engines/publication.js";

describe("recipePublicationCheck", () => {
  it("BEER : toujours publiable (aucune règle core)", () => {
    expect(recipePublicationCheck({ engine: "BEER" })).toEqual({ publishable: true, errors: [] });
  });

  it("ALT : pH ET stabilisation obligatoires (ADR-06)", () => {
    const ok = recipePublicationCheck({
      engine: "ALT_FERMENTED",
      ph: 3.4,
      stabilizationMethod: "PASTEURIZATION",
    });
    expect(ok.publishable).toBe(true);

    const none = recipePublicationCheck({ engine: "ALT_FERMENTED" });
    expect(none.publishable).toBe(false);
    expect(none.errors).toContain(ALT_PH_REQUIRED);
    expect(none.errors).toContain(ALT_STABILIZATION_REQUIRED);

    const noStab = recipePublicationCheck({ engine: "ALT_FERMENTED", ph: 3.4 });
    expect(noStab.errors).toEqual([ALT_STABILIZATION_REQUIRED]);
  });

  it("SOFT : pH obligatoire", () => {
    expect(recipePublicationCheck({ engine: "SOFT_DRINK", ph: 3.0 }).publishable).toBe(true);
    const noPh = recipePublicationCheck({ engine: "SOFT_DRINK" });
    expect(noPh.errors).toContain(SOFT_PH_REQUIRED);
  });

  it("SOFT : stockage ambiant à pH > 4.6 exige une stabilisation", () => {
    const blocked = recipePublicationCheck({
      engine: "SOFT_DRINK",
      ph: 5.0,
      storageMode: "ambient",
    });
    expect(blocked.publishable).toBe(false);
    expect(blocked.errors).toContain(SOFT_STABILIZATION_REQUIRED);

    const stabilized = recipePublicationCheck({
      engine: "SOFT_DRINK",
      ph: 5.0,
      storageMode: "ambient",
      stabilizationMethod: "PASTEURIZATION",
    });
    expect(stabilized.publishable).toBe(true);

    // pH > 4.6 mais stockage froid → pas d'exigence de stabilisation.
    const cold = recipePublicationCheck({ engine: "SOFT_DRINK", ph: 5.0, storageMode: "cold" });
    expect(cold.publishable).toBe(true);
  });
});
