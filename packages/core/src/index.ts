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

// Corrections densité pré-ébullition — impact estimé OG/ABV (M4-02, FORMULES §1/§2/§3/§9.3, ADR-11).
export * from "./formulas/corrections.js";

// Schémas Zod partagés + types d'entrée des recettes par moteur (M1-12/M1-14, ADR-04/ADR-06).
export * from "./schemas/index.js";

// Moteurs de calcul BEER / ALT_FERMENTED / SOFT_DRINK + dispatcher (M1-12, ADR-06/ADR-11).
export * from "./engines/index.js";

// State Machine Jour J pure — phases, transitions, timers sanctuarisés (M1-13, ADR-08).
export * from "./stateMachine/index.js";

// Données de référence statiques — styles BJCP (M2-04, seed M1-02 côté DB).
export * from "./reference/index.js";

// Import/export BeerXML 1.0 — moteur BEER uniquement (M2-10, spec « scope limité »).
export * from "./beerxml/index.js";

// Import/export JSON propriétaire brasso-recipe v1 — ALT_FERMENTED / SOFT_DRINK (M2-11).
export * from "./interchange/index.js";

// Plan d'eau & volumes d'équipement — assemblage matériel du brassage (M3-01, FORMULES §6).
export * from "./equipment/index.js";

// Profils d'eau & suggestion de sels brassicoles — chimie indicative (M3-02, FORMULES Annexe D, ADR-11).
export * from "./water/index.js";

// Calculs de stock purs — niveau dérivé, ajustement au volume réel, seuil de réappro (M5-01, §3.3).
export * from "./stock/index.js";

// Helpers purs membres & RGPD — statut dérivé, consentements, anonymisation, export (M6-02, §3.4).
export * from "./members/index.js";

// Helpers purs hub caisse & affichage — rapprochement vente↔stock, CSV compta, rendu écran (M7-01, §3.6).
export * from "./hub/index.js";

// Calculateurs d'atelier autonomes — starter, eau, dilution, BIAB (M8-01, FORMULES §6/§9.3/§12).
export * from "./calculators/index.js";

// Cycle post-ensemencement — jalons datés fermentation/dry hop/cold crash/garde (M9-05, FORMULES §13.1).
export * from "./batchCycle/index.js";
