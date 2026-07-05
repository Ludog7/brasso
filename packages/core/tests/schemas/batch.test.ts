import { describe, expect, it } from "vitest";

import { batchSchema } from "../../src/schemas/batch.js";

describe("batchSchema — planification", () => {
  it("valide un batch minimal et applique status=PLANIFIE", () => {
    const b = batchSchema.parse({ recipeId: "rec_1", recipeVersion: 1 });
    expect(b.status).toBe("PLANIFIE");
  });

  it("recipeVersion doit être un entier positif", () => {
    expect(batchSchema.safeParse({ recipeId: "rec_1", recipeVersion: 0 }).success).toBe(false);
    expect(batchSchema.safeParse({ recipeId: "rec_1", recipeVersion: 1.5 }).success).toBe(false);
  });

  it("recipeId non vide requis", () => {
    expect(batchSchema.safeParse({ recipeId: "", recipeVersion: 1 }).success).toBe(false);
  });

  it("plannedAt coerce une chaîne ISO en Date", () => {
    const b = batchSchema.parse({
      recipeId: "rec_1",
      recipeVersion: 2,
      status: "EN_BRASSAGE",
      plannedAt: "2026-07-05T10:00:00.000Z",
    });
    expect(b.plannedAt).toBeInstanceOf(Date);
    expect(b.status).toBe("EN_BRASSAGE");
  });
});
