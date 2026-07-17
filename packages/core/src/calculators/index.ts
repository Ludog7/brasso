/**
 * Calculateurs d'atelier **autonomes** (M8-01) — starter, eau, dilution, BIAB.
 * Fonctions **pures** (ADR-03), indépendantes de toute recette/batch/DB/UI. Les
 * formules font foi dans `docs/FORMULES-BRASSICOLES.md` (§6, §9.3, §12) ; les schémas
 * Zod d'entrée vivent dans `../schemas/calculators.js`.
 */

export * from "./biab.js";
export * from "./dilution.js";
export * from "./starter.js";
export * from "./water.js";
