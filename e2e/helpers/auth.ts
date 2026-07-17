/**
 * Helper d'authentification E2E (M8-05) : ouvre `/login`, saisit les identifiants
 * du compte du rôle demandé et attend la redirection vers l'accueil (session
 * établie par cookie httpOnly, ADR-10). Réutilisable par tous les parcours.
 */

import { expect, type Page } from "@playwright/test";

import { ACCOUNTS, type Role } from "../fixtures/accounts.js";

/** Connecte la page en tant que `role` via le vrai écran de connexion. */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const account = ACCOUNTS[role];
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  // Redirection vers l'accueil = login réussi (LoginPage `navigate("/")`).
  await page.waitForURL("**/");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeHidden();
}
