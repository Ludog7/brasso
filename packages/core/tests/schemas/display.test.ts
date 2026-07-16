import { describe, expect, it } from "vitest";

import {
  displayScreenInputSchema,
  displayScreenItemInputSchema,
  displaySurfaceInputSchema,
} from "../../src/schemas/display.js";

describe("displaySurfaceInputSchema", () => {
  it("accepte un nom libre et applique isActive par défaut", () => {
    const parsed = displaySurfaceInputSchema.parse({ name: "Bar" });
    expect(parsed.isActive).toBe(true);
  });

  it("rejette un nom vide", () => {
    expect(displaySurfaceInputSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("displayScreenInputSchema", () => {
  it("applique le template CARDS par défaut", () => {
    const parsed = displayScreenInputSchema.parse({ name: "Écran principal" });
    expect(parsed.template).toBe("CARDS");
    expect(parsed.isActive).toBe(true);
  });

  it("accepte les templates LIST/TABLE et des mentions légales libres", () => {
    const parsed = displayScreenInputSchema.parse({
      name: "Carte",
      template: "TABLE",
      legalMentions: "L'abus d'alcool est dangereux pour la santé.",
    });
    expect(parsed.template).toBe("TABLE");
    expect(parsed.legalMentions).toContain("alcool");
  });

  it("rejette un template inconnu", () => {
    expect(displayScreenInputSchema.safeParse({ name: "x", template: "GRID" }).success).toBe(false);
  });
});

describe("displayScreenItemInputSchema", () => {
  it("applique les flags à false et sortOrder 0 par défaut", () => {
    const parsed = displayScreenItemInputSchema.parse({ catalogItemId: "cat_1" });
    expect(parsed.isNew).toBe(false);
    expect(parsed.isFavorite).toBe(false);
    expect(parsed.isSpecial).toBe(false);
    expect(parsed.sortOrder).toBe(0);
  });

  it("accepte les flags, un prix et un ordre explicites", () => {
    const parsed = displayScreenItemInputSchema.parse({
      catalogItemId: "cat_1",
      isNew: true,
      isFavorite: true,
      priceCents: 450,
      sortOrder: 3,
    });
    expect(parsed.isNew).toBe(true);
    expect(parsed.priceCents).toBe(450);
    expect(parsed.sortOrder).toBe(3);
  });

  it("rejette un prix négatif ou non entier", () => {
    expect(
      displayScreenItemInputSchema.safeParse({ catalogItemId: "c", priceCents: -1 }).success,
    ).toBe(false);
    expect(
      displayScreenItemInputSchema.safeParse({ catalogItemId: "c", priceCents: 4.5 }).success,
    ).toBe(false);
  });

  it("rejette un catalogItemId manquant", () => {
    expect(displayScreenItemInputSchema.safeParse({}).success).toBe(false);
  });
});
