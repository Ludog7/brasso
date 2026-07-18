/**
 * Parcours critique #4 — **cycle adhésion** (M8-06).
 *
 * Un membre seedé **sans cotisation** (statut `EN_RETARD`). Un webhook HelloAsso
 * **signé** d'une cotisation, **rapproché par email**, pose la dernière cotisation
 * et fait passer le **statut dérivé** à `A_JOUR` (« À jour ») dans l'UI membres.
 *
 * Robustesse retries : le webhook est idempotent → on assert l'**état final**
 * (« À jour »), sans dépendre du statut initial ni de « created ».
 */

import { expect, test } from "@playwright/test";

import { MEMBER_EMAIL, MEMBER_FIRST_NAME, MEMBER_LAST_NAME } from "../fixtures/accounts.js";
import { loginAs } from "../helpers/auth.js";
import { postHelloAssoContribution } from "../helpers/webhook.js";

test.describe("Parcours adhésion — cotisation → statut à jour", () => {
  test("cotisation HelloAsso rapprochée par email → membre « À jour »", async ({
    page,
    request,
  }) => {
    const fullName = `${MEMBER_FIRST_NAME} ${MEMBER_LAST_NAME}`;

    const res = await postHelloAssoContribution(request, {
      orderId: 42424201,
      payerEmail: MEMBER_EMAIL,
    });
    expect(res.ok()).toBeTruthy();

    await loginAs(page, "admin");
    await page.goto("/members");

    const row = page.locator("tr", { hasText: fullName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("À jour");
  });
});
