import { describe, expect, it } from "vitest";

import { computeBatchCost } from "../../src/stock/cost.js";

describe("computeBatchCost", () => {
  it("cas nominal : ingrédients + conditionnement + €/L + €/unité (valeurs à la main)", () => {
    // ingrédients : 2000×1 + 200×8 + 1×450 = 2000 + 1600 + 450 = 4050
    // conditionnement : 60×25 + 60×3 = 1500 + 180 = 1680
    // total = 4050 + 1680 = 5730
    // €/L = round(5730 / 20) = round(286.5) = 287
    // €/unité = round(5730 / 60) = round(95.5) = 96
    expect(
      computeBatchCost({
        ingredients: [
          { quantity: 2000, unitCostCents: 1 },
          { quantity: 200, unitCostCents: 8 },
          { quantity: 1, unitCostCents: 450 },
        ],
        conditioning: [
          { quantity: 60, unitCostCents: 25 },
          { quantity: 60, unitCostCents: 3 },
        ],
        batchVolumeL: 20,
        packagedUnits: 60,
      }),
    ).toEqual({
      ingredientsCents: 4050,
      conditioningCents: 1680,
      bulkCents: 0,
      totalCents: 5730,
      costPerLiterCents: 287,
      costPerPackagedUnitCents: 96,
      missingCostLines: 0,
    });
  });

  it("imputation forfaitaire bulk ajoutée au total", () => {
    const result = computeBatchCost({
      ingredients: [{ quantity: 100, unitCostCents: 10 }],
      conditioning: [],
      bulkForfaitCents: 500,
    });
    expect(result.ingredientsCents).toBe(1000);
    expect(result.conditioningCents).toBe(0);
    expect(result.bulkCents).toBe(500);
    expect(result.totalCents).toBe(1500);
  });

  it("ligne à coût inconnu (null) : comptée 0 et incrémente missingCostLines", () => {
    const result = computeBatchCost({
      ingredients: [
        { quantity: 100, unitCostCents: 10 }, // 1000
        { quantity: 50, unitCostCents: null }, // inconnu → 0
      ],
      conditioning: [{ quantity: 60, unitCostCents: null }], // inconnu → 0
    });
    expect(result.ingredientsCents).toBe(1000);
    expect(result.conditioningCents).toBe(0);
    expect(result.totalCents).toBe(1000);
    expect(result.missingCostLines).toBe(2);
  });

  it("batchVolumeL / packagedUnits absents ou ≤ 0 → coûts unitaires null", () => {
    const base = {
      ingredients: [{ quantity: 100, unitCostCents: 10 }],
      conditioning: [],
    };
    expect(computeBatchCost(base).costPerLiterCents).toBeNull();
    expect(computeBatchCost(base).costPerPackagedUnitCents).toBeNull();
    expect(computeBatchCost({ ...base, batchVolumeL: 0 }).costPerLiterCents).toBeNull();
    expect(computeBatchCost({ ...base, packagedUnits: -5 }).costPerPackagedUnitCents).toBeNull();
  });

  it("arrondi centimes : coût de ligne et coûts unitaires arrondis (Math.round)", () => {
    // ligne : round(0.5 × 3) = round(1.5) = 2
    // total = 2 ; €/L = round(2 / 3) = round(0.666…) = 1
    const result = computeBatchCost({
      ingredients: [{ quantity: 0.5, unitCostCents: 3 }],
      conditioning: [],
      batchVolumeL: 3,
    });
    expect(result.ingredientsCents).toBe(2);
    expect(result.totalCents).toBe(2);
    expect(result.costPerLiterCents).toBe(1);
  });

  it("entrées vides → tout à 0, aucune ligne manquante", () => {
    expect(computeBatchCost({ ingredients: [], conditioning: [] })).toEqual({
      ingredientsCents: 0,
      conditioningCents: 0,
      bulkCents: 0,
      totalCents: 0,
      costPerLiterCents: null,
      costPerPackagedUnitCents: null,
      missingCostLines: 0,
    });
  });

  it("quantity négative ou non finie → RangeError", () => {
    expect(() =>
      computeBatchCost({ ingredients: [{ quantity: -1, unitCostCents: 10 }], conditioning: [] }),
    ).toThrow(RangeError);
    expect(() =>
      computeBatchCost({
        ingredients: [],
        conditioning: [{ quantity: Number.NaN, unitCostCents: 10 }],
      }),
    ).toThrow(RangeError);
  });

  it("unitCostCents négatif ou non fini → RangeError", () => {
    expect(() =>
      computeBatchCost({ ingredients: [{ quantity: 10, unitCostCents: -5 }], conditioning: [] }),
    ).toThrow(RangeError);
    expect(() =>
      computeBatchCost({
        ingredients: [{ quantity: 10, unitCostCents: Number.POSITIVE_INFINITY }],
        conditioning: [],
      }),
    ).toThrow(RangeError);
  });

  it("bulkForfaitCents négatif ou non fini → RangeError", () => {
    expect(() =>
      computeBatchCost({ ingredients: [], conditioning: [], bulkForfaitCents: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      computeBatchCost({ ingredients: [], conditioning: [], bulkForfaitCents: Number.NaN }),
    ).toThrow(RangeError);
  });
});
