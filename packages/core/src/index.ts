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

// Formules brassicoles — amertume IBU Tinseth / Rager (M1-06, FORMULES §4).
export * from "./formulas/ibu.js";

// Formules brassicoles — couleur EBC/SRM (Morey) + ebcToHex (M1-07, FORMULES §5 + Annexe A).
export * from "./formulas/color.js";

// Formules brassicoles — empâtage & eau : strike, sparge, infusion (M1-08, FORMULES §6).
export * from "./formulas/mash.js";

// Formules brassicoles — mesures densimètre / réfractomètre Terrill (M1-09, FORMULES §7).
export * from "./formulas/measurements.js";

// Formules brassicoles — carbonatation : priming, keg PSI, CO₂ résiduel (M1-10, FORMULES §8).
export * from "./formulas/carbonation.js";

// Formules brassicoles — post-mortem : rendement, atténuation, dilution, blend (M1-11, FORMULES §9).
export * from "./formulas/postmortem.js";
