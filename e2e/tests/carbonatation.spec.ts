/**
 * Parcours critique — **mise en condition d'un fût** (#273, M9-15).
 *
 * Asservit le critère observable du ticket : *un fût carbonaté et relevé à la
 * cible affiche sa date de mise en vente*.
 *
 * Ce parcours existe parce que M9-15 a livré tout le calcul côté serveur sans
 * qu'aucun écran ne permette de faire le relevé : la fonctionnalité était
 * **inatteignable sous une CI verte**, exactement comme #276. Des tests
 * unitaires web n'auraient pas rattrapé cela — ils simulent le serveur, donc ils
 * valident un câblage qu'ils inventent. D'où une vérification contre l'app
 * réelle, qui couvre en une fois :
 *
 * - les **chemins et enveloppes** du client face aux routes réelles ;
 * - `pendingReason` exposé en **lecture** (écran rouvert à froid, des jours
 *   après la mise en fût) ;
 * - la **persistance** de la date, qui doit survivre à un rechargement ;
 * - l'**atteignabilité** de l'écran depuis un brassin `TERMINE` — l'état où le
 *   conditionnement laisse précisément le brassin.
 *
 * Le Jour J est court-circuité par transitions d'API : il est déjà couvert par
 * `brassage.spec.ts`, et le rejouer ici coûterait une minute pour rien.
 */

import { expect, test } from "@playwright/test";

import { EQUIPMENT_ID, RECIPE_ID } from "../fixtures/accounts.js";
import { loginAs } from "../helpers/auth.js";

test.describe("Parcours mise en condition — carbonatation forcée au fût", () => {
  test.setTimeout(120_000);

  test("un fût relevé à la cible affiche sa date de mise en vente", async ({ page }) => {
    await loginAs(page, "brasseur");

    // 1. Brassin planifié depuis la recette publiée seedée.
    await page.goto(`/batches/new/${RECIPE_ID}`);
    await page.getByLabel("Profil d'équipement").selectOption(EQUIPMENT_ID);
    await page.getByRole("button", { name: "Créer le batch" }).click();
    await expect(page.getByRole("heading", { name: /Batch nº\s*\d+/ })).toBeVisible();

    const batchId = /\/batches\/([^/]+)/.exec(page.url())?.[1] as string;

    // 2. Raccourci jusqu'à un statut conditionnable : le Jour J n'est pas l'objet
    //    de cette vérification (il est déjà couvert par le parcours M9-14).
    for (const status of ["EN_BRASSAGE", "EN_FERMENTATION"]) {
      const res = await page.request.post(`/api/batches/${batchId}/status`, { data: { status } });
      expect(res.status(), `transition ${status}`).toBe(200);
    }

    // 3. Conditionnement d'UN FÛT en carbonatation forcée, 2,4 volumes visés.
    await page.goto(`/batches/${batchId}/packaging`);
    await page.getByLabel(/Volume rempli par contenant/).fill("20");
    await page.getByLabel("Quantité", { exact: true }).fill("1");
    await page.getByLabel("Mise en condition").selectOption("FORCED_CARBONATION");
    await page.getByLabel(/CO₂ visé/).fill("2.4");

    await page.getByRole("button", { name: "Enregistrer le conditionnement" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmer et enregistrer" })
      .click();
    await expect(page.getByText("Conditionnement enregistré")).toBeVisible();

    // 4. Le fût attend un relevé — et le dit (pendingReason exposé en LECTURE).
    await expect(page.getByText(/en attente d'un relevé de pression/i)).toBeVisible();

    // 5. Aide au réglage : pression cible à 4 °C (~0,744 bar, FORMULES §8.2).
    await page.getByLabel(/Température de la bière/).fill("4");
    await page.getByRole("button", { name: "Pression à régler" }).click();
    const hint = page.getByText(/Régler le détendeur sur/);
    await expect(hint).toBeVisible();
    const targetBar = /(\d+,\d+) bar/
      .exec(await hint.innerText())?.[1]
      ?.replace(",", ".") as string;
    expect(Number(targetBar)).toBeGreaterThan(0.7);
    expect(Number(targetBar)).toBeLessThan(0.8);

    // 6. Relevé À LA CIBLE → verdict, puis date de mise en vente sur la ligne.
    await page.getByLabel(/Pression relevée/).fill(targetBar);
    await page.getByRole("button", { name: "Enregistrer le relevé" }).click();
    await expect(page.getByRole("status")).toContainText("atteint la cible");
    await expect(page.getByText(/Mise en vente estimée au/)).toBeVisible();

    // 7. La date SURVIT au rechargement (elle est bien persistée, pas d'écran).
    await page.reload();
    await expect(page.getByText(/Mise en vente estimée au/)).toBeVisible();
    await expect(page.getByText(/en attente d'un relevé de pression/i)).toBeHidden();

    // 8. Et l'écran reste ATTEIGNABLE depuis un brassin `TERMINE` (câblage #273).
    await page.goto(`/batches/${batchId}`);
    await page.getByRole("link", { name: "Mise en condition" }).click();
    await expect(page).toHaveURL(/\/packaging$/);
    await expect(page.getByText(/Mise en vente estimée au/)).toBeVisible();
  });
});
