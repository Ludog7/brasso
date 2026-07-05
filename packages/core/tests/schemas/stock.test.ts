import { describe, expect, it } from "vitest";

import {
  catalogItemSchema,
  stockLotSchema,
  stockMovementSchema,
  stockReservationSchema,
} from "../../src/schemas/stock.js";

describe("catalogItemSchema", () => {
  it("RECETTE sans catégorie → refus (path category)", () => {
    const res = catalogItemSchema.safeParse({ name: "Cascade", kind: "RECETTE" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.path).toEqual(["category"]);
  });

  it("RECETTE avec catégorie → ok, défauts unit=GRAM/isActive=true", () => {
    const item = catalogItemSchema.parse({ name: "Cascade", kind: "RECETTE", category: "HOP" });
    expect(item.unit).toBe("GRAM");
    expect(item.isActive).toBe(true);
  });

  it("BULK sans catégorie → ok (pas d'exigence)", () => {
    expect(catalogItemSchema.safeParse({ name: "CO2", kind: "BULK" }).success).toBe(true);
  });

  it("coût unitaire négatif rejeté", () => {
    expect(
      catalogItemSchema.safeParse({ name: "X", kind: "BULK", defaultUnitCostCents: -5 }).success,
    ).toBe(false);
  });
});

describe("stockLotSchema", () => {
  it("quantity par défaut = 0", () => {
    expect(stockLotSchema.parse({ catalogItemId: "cat_1" }).quantity).toBe(0);
  });
});

describe("stockMovementSchema — delta non nul", () => {
  it("delta = 0 rejeté", () => {
    const res = stockMovementSchema.safeParse({
      catalogItemId: "cat_1",
      delta: 0,
      reason: "ADJUSTMENT",
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.path).toEqual(["delta"]);
  });

  it("delta signé non nul accepté", () => {
    expect(
      stockMovementSchema.safeParse({ catalogItemId: "cat_1", delta: -500, reason: "PRODUCTION" })
        .success,
    ).toBe(true);
  });
});

describe("stockReservationSchema", () => {
  it("quantité positive + status par défaut RESERVED", () => {
    const r = stockReservationSchema.parse({
      catalogItemId: "cat_1",
      batchId: "batch_1",
      quantity: 2500,
    });
    expect(r.status).toBe("RESERVED");
  });

  it("quantité ≤ 0 rejetée", () => {
    expect(
      stockReservationSchema.safeParse({ catalogItemId: "c", batchId: "b", quantity: 0 }).success,
    ).toBe(false);
  });
});
