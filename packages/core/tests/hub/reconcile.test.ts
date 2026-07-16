import { describe, expect, it } from "vitest";

import {
  resolveSaleReconciliation,
  type SaleAlertDecision,
  type SaleMovementDecision,
} from "../../src/hub/reconcile.js";

const sale = {
  occurredAt: new Date("2026-07-03T18:30:00Z"),
  providerLabel: "SumUp",
};

describe("resolveSaleReconciliation", () => {
  it("mappé (catalogItemId présent) → mouvement SALE de delta négatif", () => {
    const decision = resolveSaleReconciliation(sale, { catalogItemId: "cat_1" });
    expect(decision.kind).toBe("movement");
    const movement = decision as SaleMovementDecision;
    expect(movement.catalogItemId).toBe("cat_1");
    expect(movement.delta).toBe(-1);
    expect(movement.reason).toBe("SALE");
  });

  it("prend en compte la quantité (multiple de la ligne de vente)", () => {
    const decision = resolveSaleReconciliation({ ...sale, quantity: 3 }, { catalogItemId: "c" });
    expect(decision).toMatchObject({ kind: "movement", delta: -3 });
  });

  it("mapping null → alerte UNMAPPED_TRANSACTION, aucun mouvement", () => {
    const decision = resolveSaleReconciliation(sale, null);
    expect(decision.kind).toBe("alert");
    const alert = decision as SaleAlertDecision;
    expect(alert.type).toBe("UNMAPPED_TRANSACTION");
    expect(alert.message).toBe(
      "1 vente non identifiée sur SumUp le 03/07 — ajustement manuel du stock requis",
    );
  });

  it("mapping présent mais catalogItemId null → alerte (jamais de mouvement)", () => {
    const decision = resolveSaleReconciliation(sale, { catalogItemId: null });
    expect(decision.kind).toBe("alert");
  });

  it("formate le jour/mois en UTC dans le message", () => {
    const decision = resolveSaleReconciliation(
      { occurredAt: new Date("2026-01-09T00:00:00Z"), providerLabel: "Zettle" },
      null,
    );
    expect(decision).toMatchObject({
      kind: "alert",
      message: "1 vente non identifiée sur Zettle le 09/01 — ajustement manuel du stock requis",
    });
  });

  it("rejette une quantité non entière ou ≤ 0", () => {
    expect(() =>
      resolveSaleReconciliation({ ...sale, quantity: 0 }, { catalogItemId: "c" }),
    ).toThrow(RangeError);
    expect(() =>
      resolveSaleReconciliation({ ...sale, quantity: 1.5 }, { catalogItemId: "c" }),
    ).toThrow(RangeError);
    expect(() =>
      resolveSaleReconciliation({ ...sale, quantity: -2 }, { catalogItemId: "c" }),
    ).toThrow(RangeError);
  });
});
