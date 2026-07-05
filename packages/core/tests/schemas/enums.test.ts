import { describe, expect, it } from "vitest";

import {
  batchStatusSchema,
  catalogKindSchema,
  ingredientCategorySchema,
  measureTypeSchema,
  recipeEngineSchema,
  recipeStatusSchema,
  reservationStatusSchema,
  stabilizationMethodSchema,
  stockMovementReasonSchema,
  stockUnitSchema,
  storageModeSchema,
} from "../../src/schemas/enums.js";

describe("Enums Zod — alignés Prisma (M1-01)", () => {
  it("recipeEngine = les 3 moteurs", () => {
    expect(recipeEngineSchema.options).toEqual(["BEER", "ALT_FERMENTED", "SOFT_DRINK"]);
    expect(recipeEngineSchema.parse("BEER")).toBe("BEER");
    expect(recipeEngineSchema.safeParse("WINE").success).toBe(false);
  });

  it("valeurs de référence des autres enums", () => {
    expect(recipeStatusSchema.options).toContain("PUBLISHED");
    expect(stabilizationMethodSchema.options).toContain("FILTRATION_ACIDIFICATION");
    expect(ingredientCategorySchema.options).toContain("HOP");
    expect(batchStatusSchema.options).toContain("EN_FERMENTATION");
    expect(measureTypeSchema.options).toEqual(["GRAVITY", "TEMPERATURE", "PH", "VOLUME", "OTHER"]);
    expect(catalogKindSchema.options).toContain("RECETTE");
    expect(stockUnitSchema.options).toEqual(["GRAM", "LITER", "UNIT"]);
    expect(stockMovementReasonSchema.options).toContain("PRODUCTION");
    expect(reservationStatusSchema.options).toEqual(["RESERVED", "CONSUMED", "RELEASED"]);
    expect(storageModeSchema.options).toEqual(["cold", "ambient"]);
  });
});
