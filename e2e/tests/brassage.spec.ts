/**
 * Parcours critique #1 — **boucle brassin complète** (M8-05, étendu en M9-14).
 *
 * Déroule, contre l'app réelle (front + API + Postgres), la boucle entière que
 * M9 a rendue possible : recette **publiée** → brassin planifié → Jour J complet
 * → durées prévisionnelles et jalons datés → vue Brassins → conditionnement →
 * **stock de produits finis** affichable au bar.
 *
 * C'est ce test qui **prouve le critère de démo du milestone** à chaque PR, et
 * qui asservit trois bugs corrigés en cours de route — ils doivent échouer
 * bruyamment s'ils réapparaissent :
 *
 * - **#232 / bug 1** : une filtration validée manuellement ne produit **aucun**
 *   écart de procédure (l'écran redérivait ses propres conditions et n'offrait
 *   aucune issue nominale).
 * - **#232 / bug 2** : un refroidissement validé à la température atteinte
 *   **enchaîne** sur l'ensemencement.
 * - **#264** : les échéances de houblonnage suivent la scission d'assainissement
 *   — le **hors-flamme** en particulier, qui restait accroché à une ébullition
 *   s'achevant avant lui.
 *
 * **Aucune temporisation fixe** (M9-14 §D) : les seules attentes portent sur des
 * conditions d'écran. Le palier d'assainissement dure une minute — plancher
 * imposé par des durées entières (cf. `seed-e2e.ts`) — d'où le budget de temps
 * élargi de ce test.
 */

import { expect, type Page, test } from "@playwright/test";

import { EQUIPMENT_ID, RECIPE_ID } from "../fixtures/accounts.js";
import { loginAs } from "../helpers/auth.js";

/**
 * Le parcours traverse un palier d'une minute (assainissement du circuit) en
 * plus du reste. Le défaut de 60 s ne suffirait pas.
 */
test.setTimeout(180_000);

/** Attente maximale de l'écoulement du palier d'assainissement (1 min + marge). */
const HOLD_TIMEOUT_MS = 120_000;

/**
 * Vocabulaire **proscrit** par l'ADR-11 sur les écrans de sécurité alimentaire :
 * on n'atteste ni innocuité ni conformité, on donne un indicateur d'aide à la
 * décision. Recherché sur le texte visible, insensible à la casse.
 */
const FORBIDDEN_WORDING = [/stérilisation/i, /stérile/i, /\bconforme\b/i, /\bsûr\b/i];

/** Aucune formulation proscrite sur l'écran courant (M9-14 §C). */
async function expectAdr11Wording(page: Page): Promise<void> {
  const body = (await page.locator("body").innerText()).normalize("NFC");
  for (const forbidden of FORBIDDEN_WORDING) {
    expect(body, `wording ADR-11 : « ${forbidden.source} » ne doit pas apparaître`).not.toMatch(
      forbidden,
    );
  }
}

/** Démarre l'étape courante puis attend l'action qui suit. */
async function startStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Démarrer l'étape" }).click();
}

/** Confirme une stabilisation en relevant la température. */
async function confirmStabilization(page: Page, tempC: string): Promise<void> {
  await page.getByLabel(/Température relevée/).fill(tempC);
  await page.getByRole("button", { name: "Confirmer la stabilisation" }).click();
}

/** Relève une mesure requise de l'étape courante (densité, volume, température). */
async function recordMeasurement(page: Page, kind: string, value: string): Promise<void> {
  await page.getByLabel("Type de mesure").selectOption({ label: kind });
  await page.getByLabel("Valeur relevée").fill(value);
  await page.getByRole("button", { name: "Enregistrer la mesure" }).click();
  // La mesure est remontée au serveur : le champ se vide au succès.
  await expect(page.getByLabel("Valeur relevée")).toHaveValue("");
}

/** Valide l'étape courante (bouton actif = conditions réunies côté `core`). */
async function validateStep(page: Page, timeout?: number): Promise<void> {
  const validate = page.getByRole("button", { name: "Valider l'étape" });
  await expect(validate).toBeEnabled(timeout === undefined ? undefined : { timeout });
  await validate.click();
}

test.describe("Parcours boucle brassin complète", () => {
  test("recette publiée → Jour J → jalons datés → conditionnement → stock produit fini", async ({
    page,
  }) => {
    await loginAs(page, "brasseur");

    // ─────────────────────────────────────────────────────────────────────
    // 1. Planifier un brassin depuis la recette publiée seedée.
    // ─────────────────────────────────────────────────────────────────────
    await page.goto(`/batches/new/${RECIPE_ID}`);
    await expect(page.getByText("Planifier un batch")).toBeVisible();
    await page.getByLabel("Profil d'équipement").selectOption(EQUIPMENT_ID);
    // Aperçu de réservation : l'ingrédient catalogué apparaît.
    await expect(page.getByText("Malt Pilsner").first()).toBeVisible();
    await page.getByRole("button", { name: "Créer le batch" }).click();

    // 2. Fiche batch : numéro attribué + stock réservé (pas encore déduit).
    await expect(page.getByRole("heading", { name: /Batch nº\s*\d+/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Déduction de stock" })).toBeVisible();
    await expect(
      page.getByText("Stock réservé à la planification, pas encore déduit."),
    ).toBeVisible();

    // Le numéro de brassin sert à retrouver l'article produit fini en fin de parcours.
    const heading = await page.getByRole("heading", { name: /Batch nº\s*\d+/ }).innerText();
    const batchNumber = /\d+/.exec(heading)?.[0] ?? "";
    expect(batchNumber).not.toBe("");
    const batchUrl = page.url();

    // ─────────────────────────────────────────────────────────────────────
    // 3. Jour J — plan complet M9 (8 étapes, assainissement dérivé compris).
    // ─────────────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "Piloter le Jour J" }).click();
    await expect(page).toHaveURL(/\/day$/);
    await page.getByRole("button", { name: "Démarrer le Jour J" }).click();

    // Étape 1/8 — Initialisation.
    await expect(page.getByText(/Étape 1 \/ 8/)).toBeVisible();
    await startStep(page);
    await validateStep(page);

    // Étape 2/8 — Empâtage : stabilisation à 67 °C, aucun palier déclaré.
    await expect(page.getByRole("heading", { name: "Empâtage", level: 2 })).toBeVisible();
    await startStep(page);
    await confirmStabilization(page, "67");
    await validateStep(page);

    // Étape 3/8 — Filtration : densité **et** volume pré-ébullition (M9-06),
    // puis validation **nominale**. C'est le cœur du bug 1.
    await expect(page.getByRole("heading", { name: "Filtration", level: 2 })).toBeVisible();
    await startStep(page);
    await recordMeasurement(page, "Densité", "1.045");
    await recordMeasurement(page, "Volume", "24");
    await validateStep(page);

    // ── Non-régression bug 1 (#232) : valider n'est pas forcer. ──────────
    // Le journal reste vide : aucune `DeviationLog` n'a été écrite.
    const journal = page.getByRole("region", { name: "Journal des écarts de procédure" });
    await expect(journal).toContainText("Aucun écart pour l'instant");

    // Étape 4/8 — Ébullition : stabilisation à 100 °C. Le palier est nul (la
    // durée est passée à l'assainissement), la validation est donc immédiate.
    await expect(page.getByRole("heading", { name: "Ébullition", level: 2 })).toBeVisible();
    await startStep(page);
    await confirmStabilization(page, "100");
    await validateStep(page);

    // Étape 5/8 — Assainissement du circuit : étape **dérivée** (M9-03), donc
    // absente de la recette. Consigne + disclaimer alimentaire (ADR-11).
    await expect(page.getByTestId("sanitize-guidance")).toBeVisible();
    await expect(page.getByTestId("sanitize-disclaimer")).toBeVisible();
    await expectAdr11Wording(page);

    await startStep(page);

    // ── Non-régression #264 : les échéances de houblonnage suivent la
    // scission d'assainissement. Le **hors-flamme** est le premier ajout que
    // la scission perdait ; il doit apparaître sur cette étape.
    const hops = page.getByRole("region", { name: "Ajouts de houblon" });
    await expect(hops).toContainText("Hors-flamme");
    await expect(hops).toContainText("Citra");

    // Volume post-ébullition (M9-06), déplacé ici avec la fin de l'ébullition.
    await recordMeasurement(page, "Volume", "22");
    // Palier d'une minute : on attend que le bouton s'active, pas une durée.
    await validateStep(page, HOLD_TIMEOUT_MS);

    // Étape 6/8 — Whirlpool (M9-03) : sans consigne de chauffe ni palier.
    await expect(page.getByRole("heading", { name: "Whirlpool", level: 2 })).toBeVisible();
    await startStep(page);
    await validateStep(page);

    // Étape 7/8 — Refroidissement : la cible est un **maximum** (`at_most`).
    await expect(page.getByRole("heading", { name: "Refroidissement", level: 2 })).toBeVisible();
    await startStep(page);
    await confirmStabilization(page, "20");
    await validateStep(page);

    // ── Non-régression bug 2 (#232) : le refroidissement validé à la cible
    // **enchaîne** sur l'ensemencement (il restait bloqué auparavant). ─────
    await expect(page.getByText(/Étape 8 \/ 8/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ensemencement", level: 2 })).toBeVisible();

    // Étape 8/8 — Ensemencement : volume ensemencé, puis saisie des durées.
    await startStep(page);
    await recordMeasurement(page, "Volume", "20");

    // ─────────────────────────────────────────────────────────────────────
    // 4. Durées prévisionnelles du cycle (M9-12) — avant clôture du Jour J.
    // ─────────────────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Valider l'étape" }).click();
    const cycleDialog = page.getByRole("dialog");
    await expect(cycleDialog.getByRole("heading", { name: "Planifier le cycle" })).toBeVisible();

    // Pré-remplissage depuis les réglages d'instance (M9-16).
    await expect(cycleDialog.getByLabel(/Fermentation/)).toHaveValue("14");
    await expect(cycleDialog.getByLabel(/Garde/)).toHaveValue("21");
    // Champ dry hop **conditionnel** : la recette en porte un (§C).
    await expect(cycleDialog.getByLabel(/Dry hop/)).toBeVisible();
    // L'aperçu est daté avant tout enregistrement.
    await expect(cycleDialog.getByText(/Fin prévue du brassin/)).toBeVisible();

    await cycleDialog.getByRole("button", { name: "Valider et planifier" }).click();
    await expect(page.getByRole("heading", { name: "Brassin terminé" })).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────
    // 5. Fiche brassin : frise des jalons **datés** (M9-10).
    // ─────────────────────────────────────────────────────────────────────
    await page.goto(batchUrl);
    const cycle = page
      .getByRole("heading", { name: "Cycle du brassin" })
      .locator("..")
      .locator("..");
    await expect(cycle).toContainText("Fermentation");
    await expect(cycle).toContainText("Dry hop");
    await expect(cycle).toContainText("Garde");
    // Des dates, pas des durées seules : « Prévu du <date> au <date> ».
    await expect(cycle.getByText(/Prévu du .+ au /).first()).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────
    // 6. Vue « Brassins » (M9-09/10) : le brassin et sa prochaine échéance.
    // ─────────────────────────────────────────────────────────────────────
    await page.goto("/batches");
    await expect(page.getByRole("heading", { name: "Brassins", level: 1 })).toBeVisible();
    const row = page
      .getByRole("listitem")
      .filter({ hasText: `N°${batchNumber}` })
      .first();
    await expect(row).toContainText("En fermentation");
    // Une échéance datée est annoncée — pas « Aucune échéance ».
    await expect(row).not.toContainText("Aucune échéance");

    // ─────────────────────────────────────────────────────────────────────
    // 7. Conditionnement (M9-13) : quantités par contenant → produit fini.
    // ─────────────────────────────────────────────────────────────────────
    await page.goto(batchUrl);
    await page.getByRole("link", { name: "Conditionner" }).click();
    await expect(page).toHaveURL(/\/packaging$/);

    // 19 L : la répartition descendante (FORMULES §13.3) tombe sur les
    // bouteilles de 75 cl — 25 unités, reste 0,25 L. Un volume de 20 L aurait
    // rempli un fût et masqué la vérification.
    await page.getByLabel(/Volume à répartir/).fill("19");
    await page.getByRole("button", { name: "Proposer une répartition" }).click();

    const quantities = page.getByLabel("Quantité", { exact: true });
    await expect(quantities.first()).toHaveValue("25");

    // La proposition est **modifiable** : l'opérateur en compte 20 réellement.
    // Ce sont ces 20 unités qui doivent être enregistrées, pas la suggestion (§B).
    await quantities.first().fill("20");

    await page.getByRole("button", { name: "Enregistrer le conditionnement" }).click();
    const confirm = page.getByRole("dialog");
    await expect(
      confirm.getByRole("heading", { name: "Confirmer le conditionnement" }),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Confirmer et enregistrer" }).click();

    // Effet constaté : produit fini créé, brassin `TERMINE`.
    await expect(page.getByText("Conditionnement enregistré")).toBeVisible();
    await expect(page.getByText(/Le produit fini est en stock/)).toBeVisible();
    await expect(page.getByText("Statut du brassin :").locator("..")).toContainText("Terminé");
    await expectAdr11Wording(page);

    // ─────────────────────────────────────────────────────────────────────
    // 8. Stock : la famille **produits finis** est incrémentée.
    // ─────────────────────────────────────────────────────────────────────
    await page.goto("/stock");
    await page.getByLabel("Filtre par type").selectOption("PRODUIT_FINI");
    const productRow = page
      .getByRole("row")
      .filter({ hasText: `Brassin n°${batchNumber}` })
      .first();
    await expect(productRow).toBeVisible();
    // Le niveau est **celui saisi** (20), pas celui de la suggestion (25) :
    // c'est l'assertion qui relie la saisie de l'opérateur au stock réel.
    await expect(productRow).toContainText("20 u");

    // ─────────────────────────────────────────────────────────────────────
    // 9. Le produit fini est **sélectionnable sur un écran d'affichage**
    //    (preuve de bout en bout de l'arbitrage Q10 — cf. #274).
    // ─────────────────────────────────────────────────────────────────────
    await page.goto("/display");
    const screenRow = page.getByRole("listitem").filter({ hasText: "Cartes du bar" }).first();
    await screenRow.getByRole("button", { name: "Produits" }).click();
    const itemsDialog = page.getByRole("dialog");
    await expect(
      itemsDialog.getByLabel("Ajouter un produit").getByRole("option", {
        name: `Brassin n°${batchNumber}`,
      }),
    ).toBeAttached();
  });
});
