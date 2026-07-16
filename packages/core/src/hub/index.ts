/**
 * Helpers **purs** du hub caisse & affichage (M7-01) — décision de rapprochement
 * vente↔stock (mode dégradé, ADR-09), sérialisation CSV compta, rendu d'écran.
 * Zéro dépendance DB/UI (ADR-03). Les schémas Zod associés vivent dans `../schemas`.
 */

export * from "./csv.js";
export * from "./display.js";
export * from "./reconcile.js";
