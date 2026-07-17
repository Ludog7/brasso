/**
 * Comptes et identifiants **déterministes** du socle E2E (M8-05). Un compte par
 * rôle RBAC (matrice §3.5) : les tests s'authentifient via {@link loginAs}. Les
 * identifiants sont fictifs et n'existent que pour la base de test isolée —
 * jamais de secret réel (CLAUDE.md §sécurité).
 */

/** Mot de passe commun aux comptes de test (≥ 12 car., jamais réutilisé en prod). */
export const E2E_PASSWORD = "e2e-Passw0rd-2026";

/** Rôles couverts par le socle (miroir des `key` seedés, `packages/db`). */
export type Role = "admin" | "brasseur" | "caisse";

/** Un compte de test = e-mail + mot de passe + rôle RBAC à affecter. */
export interface Account {
  readonly email: string;
  readonly password: string;
  readonly roleKey: Role;
  readonly displayName: string;
}

/** Table des comptes de test, indexée par rôle. */
export const ACCOUNTS: Record<Role, Account> = {
  admin: {
    email: "admin@brasso.test",
    password: E2E_PASSWORD,
    roleKey: "admin",
    displayName: "Admin E2E",
  },
  brasseur: {
    email: "brasseur@brasso.test",
    password: E2E_PASSWORD,
    roleKey: "brasseur",
    displayName: "Brasseur E2E",
  },
  caisse: {
    email: "caisse@brasso.test",
    password: E2E_PASSWORD,
    roleKey: "caisse",
    displayName: "Caisse E2E",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Identifiants FIXES des données de parcours (URLs prévisibles dans les tests).
// ─────────────────────────────────────────────────────────────────────────────

/** Article de catalogue seedé par la base (`packages/db/seed/data/catalog.ts`). */
export const MALT_CATALOG_ID = "cat-malt-pilsner";

/** Profil d'équipement actif dédié au parcours brassage. */
export const EQUIPMENT_ID = "e2e-equipment-20l";

/** Famille + version 1 de la recette publiée de parcours (BEER). */
export const RECIPE_FAMILY_ID = "e2e-family-blonde";
export const RECIPE_ID = "e2e-recipe-blonde";
