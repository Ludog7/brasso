import { describe, expect, it } from "vitest";

import {
  externalSaleSchema,
  integrationAlertSchema,
  skuMappingInputSchema,
  skuMappingSchema,
} from "../../src/schemas/hub.js";

describe("externalSaleSchema", () => {
  const base = {
    externalId: "tx_1",
    amountCents: 450,
    occurredAt: "2026-07-03T10:00:00Z",
  };

  it("accepte une vente minimale et applique la devise par défaut", () => {
    const parsed = externalSaleSchema.parse(base);
    expect(parsed.currency).toBe("EUR");
    expect(parsed.amountCents).toBe(450);
    expect(parsed.occurredAt).toBeInstanceOf(Date);
  });

  it("accepte les champs optionnels (produit, libellé, moyen de paiement)", () => {
    const parsed = externalSaleSchema.parse({
      ...base,
      currency: "USD",
      paymentMethod: "card",
      externalProductId: "SKU-EXT-9",
      itemLabel: "IPA 33cl",
    });
    expect(parsed.externalProductId).toBe("SKU-EXT-9");
    expect(parsed.itemLabel).toBe("IPA 33cl");
  });

  it("rejette un montant négatif", () => {
    expect(externalSaleSchema.safeParse({ ...base, amountCents: -1 }).success).toBe(false);
  });

  it("rejette un montant non entier", () => {
    expect(externalSaleSchema.safeParse({ ...base, amountCents: 4.5 }).success).toBe(false);
  });

  it("rejette une date invalide", () => {
    expect(externalSaleSchema.safeParse({ ...base, occurredAt: "pas-une-date" }).success).toBe(
      false,
    );
  });

  it("rejette un externalId vide", () => {
    expect(externalSaleSchema.safeParse({ ...base, externalId: "" }).success).toBe(false);
  });
});

describe("skuMappingInputSchema / skuMappingSchema", () => {
  it("accepte un mapping avec article rattaché", () => {
    const parsed = skuMappingInputSchema.parse({
      internalSku: "IPA-33",
      catalogItemId: "cat_1",
      providerId: "prov_1",
      externalProductId: "ext_1",
      externalCategory: "Bières",
    });
    expect(parsed.catalogItemId).toBe("cat_1");
  });

  it("accepte un mapping incomplet (catalogItemId null)", () => {
    const parsed = skuMappingInputSchema.parse({
      internalSku: "IPA-33",
      catalogItemId: null,
      providerId: "prov_1",
      externalProductId: "ext_1",
    });
    expect(parsed.catalogItemId).toBeNull();
  });

  it("rejette un providerId manquant", () => {
    expect(
      skuMappingInputSchema.safeParse({
        internalSku: "IPA-33",
        externalProductId: "ext_1",
      }).success,
    ).toBe(false);
  });

  it("schema persisté exige identité + timestamps", () => {
    const parsed = skuMappingSchema.parse({
      id: "map_1",
      internalSku: "IPA-33",
      providerId: "prov_1",
      externalProductId: "ext_1",
      createdAt: "2026-07-03T10:00:00Z",
      updatedAt: "2026-07-03T10:00:00Z",
    });
    expect(parsed.id).toBe("map_1");
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });
});

describe("integrationAlertSchema", () => {
  it("applique le statut OPEN par défaut", () => {
    const parsed = integrationAlertSchema.parse({
      type: "UNMAPPED_TRANSACTION",
      message: "1 vente non identifiée",
    });
    expect(parsed.status).toBe("OPEN");
  });

  it("rejette un type inconnu", () => {
    expect(integrationAlertSchema.safeParse({ type: "NOPE", message: "x" }).success).toBe(false);
  });

  it("rejette un message vide", () => {
    expect(integrationAlertSchema.safeParse({ type: "OTHER", message: "" }).success).toBe(false);
  });
});
