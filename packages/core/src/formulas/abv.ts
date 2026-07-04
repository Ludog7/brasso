/**
 * Taux d'alcool — ABV (en volume) et ABW (en masse).
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §3. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md).
 *
 * Consommé par les moteurs BEER et ALT_FERMENTED (M1-12) et affiché sur l'UI
 * recette. Fonctions pures (ADR-03). `og`/`fg` sont des SG brutes (ex. 1.060),
 * cohérentes avec `calcOg`/`calcFg` (M1-04) ; le résultat est un pourcentage.
 */

import { ABV_FACTOR } from "../units.js";

// ─────────────────────────────────────────────────────────────────────────────
// Coefficients des formules ABV/ABW — FORMULES §3.2 (alternate) et §3.3 (ABW).
// `ABV_FACTOR` (131.25, standard §3.1) vit dans units.ts (Annexe B).
// ─────────────────────────────────────────────────────────────────────────────

/** Numérateur de la formule ABV alternate (§3.2). */
export const ABV_ALTERNATE_NUMERATOR = 76.08;
/** Terme correctif sur l'OG au dénominateur de l'ABV alternate (§3.2). */
export const ABV_ALTERNATE_OG_TERM = 1.775;
/** Diviseur appliqué à la FG dans l'ABV alternate (§3.2). */
export const ABV_ALTERNATE_FG_DIVISOR = 0.794;
/** Facteur ABV → ABW (§3.3) : densité relative de l'éthanol. */
export const ABW_MASS_FACTOR = 0.789;

/** Méthode de calcul de l'ABV (§3.4). */
export type AbvMethod = "standard" | "alternate";

/**
 * Taux d'alcool en volume (ABV, %) — FORMULES §3.
 *
 * - `standard` (défaut, §3.1) : `(OG − FG) × 131.25`. Suffisant jusqu'à ~6–7 % ;
 *   au-delà, sous-estime légèrement.
 * - `alternate` (§3.2, option « bières fortes ») :
 *   `(76.08 × (OG − FG) / (1.775 − OG)) × (FG / 0.794)`.
 *
 * @param og     densité initiale en SG brute (ex. 1.060).
 * @param fg     densité finale en SG brute (ex. 1.012).
 * @param method méthode de calcul (défaut `standard`).
 * @returns ABV en pourcentage (ex. 6.30).
 */
export function calcAbv(og: number, fg: number, method: AbvMethod = "standard"): number {
  if (method === "alternate") {
    return (
      ((ABV_ALTERNATE_NUMERATOR * (og - fg)) / (ABV_ALTERNATE_OG_TERM - og)) *
      (fg / ABV_ALTERNATE_FG_DIVISOR)
    );
  }
  return (og - fg) * ABV_FACTOR;
}

/**
 * Taux d'alcool en masse (ABW, %) — FORMULES §3.3 : `ABV × 0.789 / FG`.
 *
 * @param abv taux d'alcool en volume (%).
 * @param fg  densité finale en SG brute (ex. 1.012).
 * @returns ABW en pourcentage.
 */
export function calcAbw(abv: number, fg: number): number {
  return (abv * ABW_MASS_FACTOR) / fg;
}
