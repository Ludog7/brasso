import { describe, expect, it } from "vitest";

import { type DisplayItemInput, selectDisplayItems } from "../../src/hub/display.js";

const now = new Date("2026-07-15T12:00:00Z");

const items: DisplayItemInput[] = [
  { catalogItemId: "b", name: "Blonde", sortOrder: 2, isFavorite: true },
  { catalogItemId: "a", name: "IPA", sortOrder: 1, isNew: true, priceCents: 450 },
  { catalogItemId: "z", name: "Rupture", sortOrder: 0, isSpecial: true },
];

const stock = { a: 12, b: 3, z: 0 };

describe("selectDisplayItems", () => {
  it("filtre les produits en rupture (stock ≤ 0 ou inconnu)", () => {
    const rendered = selectDisplayItems(items, stock, now);
    expect(rendered.map((i) => i.catalogItemId)).toEqual(["a", "b"]);
  });

  it("stock inconnu (absent de la map) → traité comme 0, filtré", () => {
    const rendered = selectDisplayItems([{ catalogItemId: "x", name: "Inconnu" }], {}, now);
    expect(rendered).toHaveLength(0);
  });

  it("trie par sortOrder croissant", () => {
    const rendered = selectDisplayItems(items, { a: 5, b: 5, z: 5 }, now);
    expect(rendered.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it("expose les flags et le prix projetés", () => {
    const [ipa] = selectDisplayItems([items[1]], stock, now);
    expect(ipa.flags).toEqual({ isNew: true, isFavorite: false, isSpecial: false });
    expect(ipa.priceCents).toBe(450);
  });

  it("prix absent → null", () => {
    const [blonde] = selectDisplayItems([items[0]], stock, now);
    expect(blonde.priceCents).toBeNull();
    expect(blonde.flags.isFavorite).toBe(true);
  });

  it("badge « nouveau » s'éteint après newUntil (now injecté)", () => {
    const withExpiry: DisplayItemInput = {
      catalogItemId: "a",
      name: "IPA",
      isNew: true,
      newUntil: new Date("2026-07-10T00:00:00Z"),
    };
    const [expired] = selectDisplayItems([withExpiry], { a: 1 }, now);
    expect(expired.flags.isNew).toBe(false);

    const stillNew: DisplayItemInput = {
      ...withExpiry,
      newUntil: new Date("2026-07-20T00:00:00Z"),
    };
    const [fresh] = selectDisplayItems([stillNew], { a: 1 }, now);
    expect(fresh.flags.isNew).toBe(true);
  });

  it("ne mute pas la liste d'entrée", () => {
    const input = [...items];
    selectDisplayItems(input, stock, now);
    expect(input.map((i) => i.catalogItemId)).toEqual(["b", "a", "z"]);
  });
});
