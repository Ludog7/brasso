/**
 * @brasso/core — cœur métier : moteurs de calcul (BEER / ALT_FERMENTED / SOFT_DRINK),
 * formules brassicoles, state machine Jour J, schémas Zod partagés.
 *
 * Zéro dépendance UI/DB (ADR-03).
 */
export const PACKAGE_NAME = "@brasso/core" as const;

// Conversions d'unités & constantes de référence (M1-03) — fondation des moteurs.
export * from "./units.js";

// Formules brassicoles — densités OG / FG / boil gravity (M1-04, FORMULES §1/§2/§4.2).
export * from "./formulas/gravity.js";

// Formules brassicoles — ABV / ABW (M1-05, FORMULES §3).
export * from "./formulas/abv.js";
