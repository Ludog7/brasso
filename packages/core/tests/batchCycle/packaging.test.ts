import { describe, expect, it } from "vitest";

import { splitIntoContainers } from "../../src/batchCycle/packaging.js";

const KEG_20 = { id: "fut-20", volumeL: 20 };
const BOTTLE_75 = { id: "bouteille-75", volumeL: 0.75 };
const BOTTLE_33 = { id: "bouteille-33", volumeL: 0.33 };

describe("splitIntoContainers — valeur de référence FORMULES §13.3", () => {
  it("24 L en fûts de 20 L puis bouteilles de 0,75 L → 1 fût + 5 bouteilles, reste 0,25 L", () => {
    const split = splitIntoContainers(24, [KEG_20, BOTTLE_75]);

    expect(split.allocations).toEqual([
      { id: "fut-20", volumeL: 20, quantity: 1, usedL: 20 },
      { id: "bouteille-75", volumeL: 0.75, quantity: 5, usedL: 3.75 },
    ]);
    expect(split.usedL).toBe(23.75);
    expect(split.remainderL).toBe(0.25);
  });

  it("le total employé plus le reste redonne le volume de départ", () => {
    const split = splitIntoContainers(24, [KEG_20, BOTTLE_75]);
    expect(split.usedL + split.remainderL).toBe(24);
  });
});

describe("splitIntoContainers — répartition descendante", () => {
  it("sert les plus grands contenants d'abord, quel que soit l'ordre d'entrée", () => {
    const ascending = splitIntoContainers(24, [BOTTLE_75, KEG_20]);
    const descending = splitIntoContainers(24, [KEG_20, BOTTLE_75]);
    // L'ordre de la liste d'entrée n'a aucune raison d'être significatif.
    expect(ascending).toEqual(descending);
    expect(ascending.allocations[0]?.id).toBe("fut-20");
  });

  it("enchaîne trois tailles, le reste finissant dans la plus petite", () => {
    // 24 L → 1 fût (20) → 4 L → 5 bouteilles 0,75 (3,75) → 0,25 L → 0 bouteille 0,33.
    const split = splitIntoContainers(24, [BOTTLE_33, KEG_20, BOTTLE_75]);
    expect(split.allocations.map((a) => [a.id, a.quantity])).toEqual([
      ["fut-20", 1],
      ["bouteille-75", 5],
    ]);
    expect(split.remainderL).toBe(0.25);
  });

  it("à contenance égale, l'ordre d'entrée est conservé (sortie stable)", () => {
    const split = splitIntoContainers(2, [
      { id: "verre-a", volumeL: 0.5 },
      { id: "verre-b", volumeL: 0.5 },
    ]);
    expect(split.allocations.map((a) => a.id)).toEqual(["verre-a"]);
    expect(split.allocations[0]?.quantity).toBe(4);
  });
});

describe("splitIntoContainers — cas limites", () => {
  it("volume inférieur à la contenance : aucune unité, tout le volume en reste", () => {
    const split = splitIntoContainers(12, [KEG_20]);
    expect(split.allocations).toEqual([]);
    expect(split.usedL).toBe(0);
    expect(split.remainderL).toBe(12);
  });

  it("reste nul quand le volume tombe juste", () => {
    const split = splitIntoContainers(40, [KEG_20]);
    expect(split.allocations[0]?.quantity).toBe(2);
    expect(split.remainderL).toBe(0);
  });

  it("ignore un contenant de contenance nulle, négative ou non finie", () => {
    // Une contenance nulle diviserait par zéro et proposerait une infinité d'unités.
    const split = splitIntoContainers(24, [
      { id: "vide", volumeL: 0 },
      { id: "negatif", volumeL: -5 },
      { id: "nan", volumeL: Number.NaN },
      { id: "infini", volumeL: Number.POSITIVE_INFINITY },
      KEG_20,
    ]);
    expect(split.allocations.map((a) => a.id)).toEqual(["fut-20"]);
    expect(split.remainderL).toBe(4);
  });

  it("aucun contenant exploitable : tout le volume reste à conditionner", () => {
    for (const containers of [[], [{ id: "vide", volumeL: 0 }]]) {
      const split = splitIntoContainers(24, containers);
      expect(split.allocations).toEqual([]);
      expect(split.remainderL).toBe(24);
    }
  });

  it("volume nul, négatif ou non fini : aucune répartition, aucun reste négatif", () => {
    for (const volume of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const split = splitIntoContainers(volume, [KEG_20]);
      expect(split.allocations).toEqual([]);
      expect(split.usedL).toBe(0);
      expect(split.remainderL).toBeGreaterThanOrEqual(0);
    }
  });

  it("un reste n'est jamais arrondi à zéro en silence", () => {
    // 20,1 L : le dixième de litre excédentaire doit rester visible.
    const split = splitIntoContainers(20.1, [KEG_20]);
    expect(split.allocations[0]?.quantity).toBe(1);
    expect(split.remainderL).toBe(0.1);
  });

  describe("robustesse à l'arithmétique flottante", () => {
    it("0,3 L en bouteilles de 0,1 L donne 3 unités, pas 2", () => {
      // `0.3 / 0.1` vaut 2,9999999999999996 en flottant : sans tolérance, on
      // perdrait une bouteille à chaque conditionnement de ce genre.
      const split = splitIntoContainers(0.3, [{ id: "fiole", volumeL: 0.1 }]);
      expect(split.allocations[0]?.quantity).toBe(3);
      expect(split.remainderL).toBe(0);
    });

    it("un reste résiduel de calcul n'apparaît pas comme un volume", () => {
      const split = splitIntoContainers(9.9, [{ id: "b", volumeL: 3.3 }]);
      expect(split.allocations[0]?.quantity).toBe(3);
      expect(split.remainderL).toBe(0);
      expect(Object.is(split.remainderL, -0)).toBe(false);
    });

    it("les contenances usuelles en 33 cl tombent juste", () => {
      const split = splitIntoContainers(9.9, [BOTTLE_33]);
      expect(split.allocations[0]?.quantity).toBe(30);
      expect(split.remainderL).toBe(0);
    });
  });
});
