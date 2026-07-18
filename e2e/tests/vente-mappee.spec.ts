/**
 * Parcours critique #2 — **vente mappée** (M8-06).
 *
 * Un webhook SumUp **signé** d'une vente dont le SKU est **mappé** à un article
 * conditionné → transaction ingérée (`MAPPED`) + `StockMovement SALE` (−1) → l'UI
 * stock reflète la **décrémentation** (50 → 49 u).
 *
 * Robustesse retries : le webhook est idempotent (rejeu = « duplicate », pas de
 * second mouvement) → on n'assert que l'**état final** (49 u), jamais « created ».
 */

import { expect, test } from "@playwright/test";

import { CONDITIONED_ITEM_NAME, MAPPED_SKU } from "../fixtures/accounts.js";
import { loginAs } from "../helpers/auth.js";
import { postSumUpSale } from "../helpers/webhook.js";

test.describe("Parcours caisse — vente mappée", () => {
  test("vente SumUp mappée → stock conditionné décrémenté", async ({ page, request }) => {
    const res = await postSumUpSale(request, {
      transactionId: "E2E-SUMUP-MAPPED-001",
      externalProductId: MAPPED_SKU,
    });
    expect(res.ok()).toBeTruthy();

    await loginAs(page, "admin");
    await page.goto("/stock");
    await page.getByLabel("Filtre par type").selectOption("CONDITIONNEMENT");

    const row = page.locator("tr", { hasText: CONDITIONED_ITEM_NAME });
    await expect(row).toBeVisible();
    // Disponible = 50 (appro seed) − 1 (vente) = 49 u.
    await expect(row).toContainText("49 u");
  });
});
