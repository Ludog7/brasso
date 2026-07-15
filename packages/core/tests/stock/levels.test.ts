import { describe, expect, it } from "vitest";

import {
  deriveStockLevel,
  evaluateReorder,
  scaleQuantityToVolume,
} from "../../src/stock/levels.js";

describe("deriveStockLevel", () => {
  it("somme signée des deltas du registre", () => {
    expect(deriveStockLevel([{ delta: 5000 }, { delta: -1200 }, { delta: 300 }])).toBe(4100);
  });

  it("registre vide → 0", () => {
    expect(deriveStockLevel([])).toBe(0);
  });
});

describe("scaleQuantityToVolume", () => {
  it("proportionnel au volume réel (3000 g / 20 L → 15 L = 2250 g)", () => {
    expect(scaleQuantityToVolume(3000, 20, 15)).toBe(2250);
  });

  it("volume réel absent/null → aucun ajustement", () => {
    expect(scaleQuantityToVolume(3000, 20)).toBe(3000);
    expect(scaleQuantityToVolume(3000, 20, null)).toBe(3000);
  });

  it("volume réel = planifié → identité", () => {
    expect(scaleQuantityToVolume(3000, 20, 20)).toBe(3000);
  });

  it("plannedVolumeL ≤ 0 ou non fini → RangeError (ajustement demandé)", () => {
    expect(() => scaleQuantityToVolume(3000, 0, 15)).toThrow(RangeError);
    expect(() => scaleQuantityToVolume(3000, Number.NaN, 15)).toThrow(RangeError);
  });

  it("quantité planifiée négative ou non finie → RangeError", () => {
    expect(() => scaleQuantityToVolume(-1, 20, 15)).toThrow(RangeError);
    expect(() => scaleQuantityToVolume(Number.NaN, 20, 15)).toThrow(RangeError);
  });

  it("volume réel négatif ou non fini → RangeError", () => {
    expect(() => scaleQuantityToVolume(3000, 20, -5)).toThrow(RangeError);
    expect(() => scaleQuantityToVolume(3000, 20, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("evaluateReorder", () => {
  it("RECETTE : disponible net des réservations, sous le seuil → alerte", () => {
    expect(
      evaluateReorder({ kind: "RECETTE", level: 5000, reserved: 4000, threshold: 1500 }),
    ).toEqual({ available: 1000, below: true });
  });

  it("RECETTE : réservations par défaut à 0 si non fournies", () => {
    expect(evaluateReorder({ kind: "RECETTE", level: 5000, threshold: 1500 })).toEqual({
      available: 5000,
      below: false,
    });
  });

  it("BULK : disponible = niveau (réservations ignorées)", () => {
    expect(evaluateReorder({ kind: "BULK", level: 800, reserved: 999, threshold: 1000 })).toEqual({
      available: 800,
      below: true,
    });
  });

  it("CONDITIONNEMENT au-dessus du seuil → pas d'alerte", () => {
    expect(evaluateReorder({ kind: "CONDITIONNEMENT", level: 500, threshold: 100 })).toEqual({
      available: 500,
      below: false,
    });
  });

  it("disponible exactement au seuil → alerte (comparaison ≤)", () => {
    expect(evaluateReorder({ kind: "BULK", level: 100, threshold: 100 }).below).toBe(true);
  });

  it("seuil absent ou null → jamais d'alerte", () => {
    expect(evaluateReorder({ kind: "BULK", level: 0 }).below).toBe(false);
    expect(evaluateReorder({ kind: "RECETTE", level: -10, threshold: null }).below).toBe(false);
  });
});
