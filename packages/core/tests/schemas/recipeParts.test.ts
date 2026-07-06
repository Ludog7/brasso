import { describe, expect, it } from "vitest";

import { processStepTypeSchema } from "../../src/schemas/enums.js";
import {
  ingredientAllowedForEngine,
  ingredientCategoriesByEngine,
  recipeIngredientInputSchema,
  recipeStepInputSchema,
  stepAllowedForEngine,
  stepParamsSchemaByType,
  stepTypesByEngine,
} from "../../src/schemas/recipeParts.js";

describe("processStepTypeSchema", () => {
  it("accepte les valeurs alignées sur Prisma et rejette l'inconnu", () => {
    expect(processStepTypeSchema.parse("MASH_STEP")).toBe("MASH_STEP");
    expect(processStepTypeSchema.parse("STABILIZE")).toBe("STABILIZE");
    expect(processStepTypeSchema.safeParse("MACERATE").success).toBe(false);
  });
});

describe("recipeIngredientInputSchema — polymorphe par catégorie", () => {
  it("MALT : applique unit=GRAM et params={} par défaut", () => {
    const malt = recipeIngredientInputSchema.parse({
      category: "MALT",
      name: "Pilsner",
      amount: 4000,
    });
    expect(malt).toMatchObject({ category: "MALT", unit: "GRAM", params: {} });
  });

  it("MALT : couleur EBC négative refusée", () => {
    const bad = recipeIngredientInputSchema.safeParse({
      category: "MALT",
      name: "Munich",
      amount: 500,
      params: { colorEbc: -1 },
    });
    expect(bad.success).toBe(false);
  });

  it("HOP : exige un `use` et une α en fraction dans [0,1]", () => {
    const hop = recipeIngredientInputSchema.parse({
      category: "HOP",
      name: "Saaz",
      amount: 30,
      use: "BOIL",
      timeMinutes: 60,
      params: { alphaFraction: 0.035, form: "pellet" },
    });
    expect(hop).toMatchObject({ category: "HOP", use: "BOIL", params: { alphaFraction: 0.035 } });

    // α manquante → invalide (params.alphaFraction requis).
    expect(
      recipeIngredientInputSchema.safeParse({
        category: "HOP",
        name: "Saaz",
        amount: 30,
        use: "BOIL",
        params: {},
      }).success,
    ).toBe(false);

    // α hors bornes → invalide.
    expect(
      recipeIngredientInputSchema.safeParse({
        category: "HOP",
        name: "Saaz",
        amount: 30,
        use: "BOIL",
        params: { alphaFraction: 1.4 },
      }).success,
    ).toBe(false);

    // `use` absent → invalide pour un houblon.
    expect(
      recipeIngredientInputSchema.safeParse({
        category: "HOP",
        name: "Saaz",
        amount: 30,
        params: { alphaFraction: 0.05 },
      }).success,
    ).toBe(false);
  });

  it("SUGAR/YEAST/ADJUNCT : params libre optionnel", () => {
    for (const category of ["SUGAR", "YEAST", "ADJUNCT"] as const) {
      const parsed = recipeIngredientInputSchema.parse({ category, name: category, amount: 100 });
      expect(parsed.category).toBe(category);
    }
  });

  it("catégorie inconnue refusée (union discriminée)", () => {
    expect(
      recipeIngredientInputSchema.safeParse({ category: "WATER", name: "eau", amount: 1 }).success,
    ).toBe(false);
  });

  it("montant négatif refusé", () => {
    expect(
      recipeIngredientInputSchema.safeParse({ category: "MALT", name: "x", amount: -5 }).success,
    ).toBe(false);
  });
});

describe("recipeStepInputSchema — params validés par type", () => {
  it("MASH_STEP : température et durée requises (palier)", () => {
    const ok = recipeStepInputSchema.parse({
      type: "MASH_STEP",
      name: "Saccharification",
      params: { tempC: 67, timeMin: 60 },
    });
    expect(ok).toMatchObject({ type: "MASH_STEP", params: { tempC: 67, timeMin: 60 } });

    const bad = recipeStepInputSchema.safeParse({ type: "MASH_STEP", params: { tempC: 67 } });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      // L'erreur est repositionnée sous `params.*`.
      expect(bad.error.issues[0]?.path).toEqual(["params", "timeMin"]);
    }
  });

  it("BOIL : durée requise", () => {
    expect(recipeStepInputSchema.parse({ type: "BOIL", params: { timeMin: 60 } }).type).toBe(
      "BOIL",
    );
    expect(recipeStepInputSchema.safeParse({ type: "BOIL", params: {} }).success).toBe(false);
  });

  it("STABILIZE : méthode optionnelle, params vides tolérés", () => {
    expect(recipeStepInputSchema.parse({ type: "STABILIZE" }).type).toBe("STABILIZE");
    expect(
      recipeStepInputSchema.parse({ type: "STABILIZE", params: { method: "PASTEURIZATION" } }).type,
    ).toBe("STABILIZE");
  });

  it("clés de params inconnues silencieusement ignorées (z.object strip)", () => {
    const parsed = recipeStepInputSchema.parse({
      type: "COOL",
      params: { targetTempC: 20, inconnu: "x" },
    });
    expect(parsed.type).toBe("COOL");
  });

  it("OTHER : params libre", () => {
    expect(recipeStepInputSchema.parse({ type: "OTHER", params: { foo: 1 } }).type).toBe("OTHER");
  });

  it("chaque type a un schéma de params dédié", () => {
    for (const type of processStepTypeSchema.options) {
      expect(stepParamsSchemaByType[type]).toBeDefined();
    }
  });
});

describe("cohérence moteur", () => {
  it("houblons & paliers d'empâtage réservés à BEER", () => {
    expect(ingredientAllowedForEngine("BEER", "HOP")).toBe(true);
    expect(ingredientAllowedForEngine("ALT_FERMENTED", "HOP")).toBe(false);
    expect(ingredientAllowedForEngine("SOFT_DRINK", "HOP")).toBe(false);
    expect(stepAllowedForEngine("BEER", "MASH_STEP")).toBe(true);
    expect(stepAllowedForEngine("ALT_FERMENTED", "MASH_STEP")).toBe(false);
  });

  it("STABILIZE réservé à ALT/SOFT, pas BEER", () => {
    expect(stepAllowedForEngine("ALT_FERMENTED", "STABILIZE")).toBe(true);
    expect(stepAllowedForEngine("SOFT_DRINK", "STABILIZE")).toBe(true);
    expect(stepAllowedForEngine("BEER", "STABILIZE")).toBe(false);
  });

  it("SOFT_DRINK n'admet ni fermentation ni malt", () => {
    expect(ingredientAllowedForEngine("SOFT_DRINK", "YEAST")).toBe(false);
    expect(stepAllowedForEngine("SOFT_DRINK", "FERMENT")).toBe(false);
    expect(ingredientAllowedForEngine("SOFT_DRINK", "SUGAR")).toBe(true);
  });

  it("les tables couvrent les trois moteurs", () => {
    expect(Object.keys(ingredientCategoriesByEngine)).toHaveLength(3);
    expect(Object.keys(stepTypesByEngine)).toHaveLength(3);
  });
});
