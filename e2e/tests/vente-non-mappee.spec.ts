/**
 * Parcours critique #3 — **vente non mappée** (M8-06).
 *
 * Un webhook SumUp **signé** d'une vente **sans mapping** → transaction `UNMAPPED`,
 * **aucun** mouvement de stock, une anomalie `UNMAPPED_TRANSACTION` **OPEN** apparaît
 * au dashboard des anomalies (mode dégradé ADR-09). Vérifie aussi qu'un webhook
 * **mal signé** est rejeté (401).
 */

import { expect, test } from "@playwright/test";

import { UNMAPPED_SKU } from "../fixtures/accounts.js";
import { loginAs } from "../helpers/auth.js";
import { postSumUpSale, postWithBadSignature, sumUpSalePayload } from "../helpers/webhook.js";

test.describe("Parcours caisse — vente non mappée", () => {
  test("vente SumUp non mappée → anomalie au dashboard", async ({ page, request }) => {
    const res = await postSumUpSale(request, {
      transactionId: "E2E-SUMUP-UNMAPPED-001",
      externalProductId: UNMAPPED_SKU,
    });
    expect(res.ok()).toBeTruthy();

    await loginAs(page, "admin");
    await page.goto("/alerts");
    // Dashboard des anomalies (filtre par défaut : ouvertes). On scope au tableau :
    // « Vente non rapprochée » est aussi une <option> masquée du filtre Type, que
    // `getByText(...).first()` capterait à tort avant la ligne d'anomalie.
    const alertsTable = page.getByRole("table");
    await expect(alertsTable.getByText("Vente non rapprochée")).toBeVisible();
    await expect(alertsTable.getByText("SumUp").first()).toBeVisible();
  });

  test("webhook mal signé → rejeté (401)", async ({ request }) => {
    const res = await postWithBadSignature(
      request,
      "/webhooks/sumup",
      sumUpSalePayload({ transactionId: "E2E-SUMUP-BADSIG-001", externalProductId: UNMAPPED_SKU }),
    );
    expect(res.status()).toBe(401);
  });
});
