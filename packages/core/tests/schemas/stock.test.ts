import { describe, expect, it } from "vitest";

import {
  catalogItemSchema,
  catalogItemUpdateSchema,
  inventoryCountSchema,
  manualStockMovementSchema,
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

describe("manualStockMovementSchema — saisie manuelle (M5-04)", () => {
  it("PRODUCTION rejeté (réservé à la déduction batch M5-05)", () => {
    expect(
      manualStockMovementSchema.safeParse({ catalogItemId: "c", delta: -500, reason: "PRODUCTION" })
        .success,
    ).toBe(false);
  });

  it("SALE rejeté (réservé au hub caisse M7)", () => {
    expect(
      manualStockMovementSchema.safeParse({ catalogItemId: "c", delta: -1, reason: "SALE" })
        .success,
    ).toBe(false);
  });

  it("delta = 0 rejeté (path delta)", () => {
    const res = manualStockMovementSchema.safeParse({
      catalogItemId: "c",
      delta: 0,
      reason: "ADJUSTMENT",
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.path).toEqual(["delta"]);
  });

  it("achat (delta positif, motif manuel) accepté", () => {
    expect(
      manualStockMovementSchema.safeParse({ catalogItemId: "c", delta: 5000, reason: "PURCHASE" })
        .success,
    ).toBe(true);
  });
});

describe("inventoryCountSchema (M5-04)", () => {
  it("quantité comptée négative rejetée", () => {
    expect(
      inventoryCountSchema.safeParse({ catalogItemId: "c", countedQuantity: -1 }).success,
    ).toBe(false);
  });

  it("comptage à 0 accepté (rupture de stock constatée)", () => {
    expect(inventoryCountSchema.safeParse({ catalogItemId: "c", countedQuantity: 0 }).success).toBe(
      true,
    );
  });
});

describe("catalogItemUpdateSchema — mise à jour partielle (M5-03)", () => {
  it("champ unique accepté (tous optionnels)", () => {
    expect(catalogItemUpdateSchema.safeParse({ reorderThreshold: 2000 }).success).toBe(true);
  });

  it("RECETTE sans catégorie accepté en update partiel (pas de refine)", () => {
    expect(catalogItemUpdateSchema.safeParse({ kind: "RECETTE" }).success).toBe(true);
  });

  it("coût négatif toujours rejeté", () => {
    expect(catalogItemUpdateSchema.safeParse({ defaultUnitCostCents: -1 }).success).toBe(false);
  });
});
