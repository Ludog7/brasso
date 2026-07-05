import { describe, expect, it } from "vitest";

import { recipeIngredientSchema, recipeSchema } from "../../src/schemas/recipeSchema.js";

describe("recipeSchema — union discriminée par engine", () => {
  it("BEER : applique les défauts (status DRAFT, ingredients [])", () => {
    const r = recipeSchema.parse({
      engine: "BEER",
      name: "IPA maison",
      beerDetails: { targetOg: 1.06, efficiency: 0.75 },
    });
    expect(r.engine).toBe("BEER");
    expect(r.status).toBe("DRAFT");
    expect(r.ingredients).toEqual([]);
  });

  it("rejette un détail incohérent avec le moteur (BEER sans beerDetails)", () => {
    const res = recipeSchema.safeParse({
      engine: "BEER",
      name: "X",
      altDetails: { baseType: "ginger" },
    });
    expect(res.success).toBe(false);
  });

  it("rejette un moteur inconnu (discriminant)", () => {
    expect(recipeSchema.safeParse({ engine: "WINE", name: "X" }).success).toBe(false);
  });

  it("efficiency hors [0,1] rejetée", () => {
    const res = recipeSchema.safeParse({
      engine: "BEER",
      name: "X",
      beerDetails: { efficiency: 1.5 },
    });
    expect(res.success).toBe(false);
  });

  describe("règle de publication ALT (ADR-06 / M1-12)", () => {
    const altBase = {
      engine: "ALT_FERMENTED" as const,
      name: "Ginger beer",
      altDetails: { baseType: "ginger", targetPh: 3.4 },
    };

    it("ALT publiée SANS stabilisation → refus (path altDetails.stabilizationMethod)", () => {
      const res = recipeSchema.safeParse({ ...altBase, status: "PUBLISHED" });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.path).toEqual(["altDetails", "stabilizationMethod"]);
      }
    });

    it("ALT publiée AVEC stabilisation → ok", () => {
      const res = recipeSchema.safeParse({
        ...altBase,
        status: "PUBLISHED",
        altDetails: { ...altBase.altDetails, stabilizationMethod: "THERMAL" },
      });
      expect(res.success).toBe(true);
    });

    it("ALT en DRAFT sans stabilisation → ok (contrainte seulement à la publication)", () => {
      const r = recipeSchema.parse(altBase);
      expect(r.status).toBe("DRAFT");
      expect(r.engine === "ALT_FERMENTED" && r.altDetails.residualSugarRisk).toBe(false);
    });
  });

  it("SOFT : storageMode contraint (cold/ambient)", () => {
    expect(
      recipeSchema.safeParse({
        engine: "SOFT_DRINK",
        name: "Limonade",
        softDetails: { storageMode: "tiède" },
      }).success,
    ).toBe(false);
    expect(
      recipeSchema.parse({
        engine: "SOFT_DRINK",
        name: "Limonade",
        softDetails: { storageMode: "cold", sugarConcentration: 80 },
      }).engine,
    ).toBe("SOFT_DRINK");
  });
});

describe("recipeIngredientSchema", () => {
  it("applique les défauts unit=GRAM, sortOrder=0", () => {
    const ing = recipeIngredientSchema.parse({ name: "Cascade", category: "HOP", amount: 30 });
    expect(ing.unit).toBe("GRAM");
    expect(ing.sortOrder).toBe(0);
  });

  it("montant négatif rejeté", () => {
    expect(
      recipeIngredientSchema.safeParse({ name: "X", category: "MALT", amount: -1 }).success,
    ).toBe(false);
  });
});
