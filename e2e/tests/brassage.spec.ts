/**
 * Parcours critique #1 — **brassage complet** (M8-05).
 *
 * Déroule, contre l'app réelle (front + API + Postgres) : connexion brasseur →
 * recette **publiée** (seed) → **planification d'un batch** (n° + réservation de
 * stock) → **Jour J** (démarrage + transitions START/VALIDATE + une stabilisation)
 * → progression cohérente jusqu'à l'ébullition. On vise les **transitions**, pas
 * l'attente d'un palier réel (le MASH est seedé sans durée de palier).
 */

import { expect, test } from "@playwright/test";

import { EQUIPMENT_ID, RECIPE_ID } from "../fixtures/accounts.js";
import { loginAs } from "../helpers/auth.js";

test.describe("Parcours brassage complet", () => {
  test("recette publiée → batch planifié (stock réservé) → Jour J progressé", async ({ page }) => {
    await loginAs(page, "brasseur");

    // 1. Planifier un batch depuis la recette publiée seedée.
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
    await expect(page.getByText("Malt Pilsner").first()).toBeVisible();

    // 3. Ouvrir le Jour J et démarrer la session.
    await page.getByRole("link", { name: "Piloter le Jour J" }).click();
    await expect(page).toHaveURL(/\/day$/);
    await page.getByRole("button", { name: "Démarrer le Jour J" }).click();

    // Étape 1/4 — Initialisation : START puis VALIDATE.
    await expect(page.getByText(/Étape 1 \/ 4/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Initialisation", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Démarrer l'étape" }).click();
    await page.getByRole("button", { name: "Valider l'étape" }).click();

    // Étape 2/4 — Empâtage : START → confirmer la stabilisation (température) → VALIDATE.
    await expect(page.getByText(/Étape 2 \/ 4/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Empâtage", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "Démarrer l'étape" }).click();
    await page.getByLabel(/Température relevée/).fill("67");
    await page.getByRole("button", { name: "Confirmer la stabilisation" }).click();
    await page.getByRole("button", { name: "Valider l'étape" }).click();

    // Progression cohérente : le brassin avance jusqu'à l'ébullition (étape suivante).
    await expect(page.getByText(/Étape 3 \/ 4/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ébullition", level: 2 })).toBeVisible();
  });
});
