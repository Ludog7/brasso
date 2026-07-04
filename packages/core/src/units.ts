/**
 * Conversions d'unités & constantes de référence brassicoles.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §0.1 (conversions) et
 * Annexe B (constantes). En cas de divergence, le document fait foi.
 *
 * RÈGLE (CLAUDE.md / ADR) : **toutes** les conversions du monorepo vivent ici,
 * nulle part ailleurs. Unités internes : g, L, °C, SG brute (1.052), EBC,
 * acides alpha en fraction, bar.
 *
 * Fonctions pures, sans dépendance UI/DB (ADR-03).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Facteurs de conversion (nommés pour éviter les nombres magiques dupliqués)
// ─────────────────────────────────────────────────────────────────────────────

/** Grammes par livre avoirdupois (masse). */
export const GRAMS_PER_POUND = 453.592;
/** Litres par gallon US (volume). */
export const LITERS_PER_GALLON = 3.78541;
/** Rapport EBC/SRM (couleur) : `EBC = SRM × 1.97`. */
export const EBC_PER_SRM = 1.97;
/** Bar par PSI (pression) : `bar = PSI × 0.0689476`. */
export const BAR_PER_PSI = 0.0689476;

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de référence — FORMULES-BRASSICOLES.md Annexe B
// ─────────────────────────────────────────────────────────────────────────────

/** Wort correction factor du réfractomètre (défaut ; plage 1.02–1.06). */
export const WCF_DEFAULT = 1.04;
/** Facteur ABV standard : `ABV(%) = (OG − FG) × 131.25`. */
export const ABV_FACTOR = 131.25;
/** Sucre de refermentation (saccharose) : g/L par volume de CO₂. */
export const PRIMING_SUCROSE = 3.9;
/** Chaleur spécifique grain/eau (approx.) pour l'eau de strike. */
export const MASH_HEAT_RATIO = 0.41;
/** Rendement de brassage par défaut (%). */
export const DEFAULT_EFFICIENCY = 72;
/** Ratio d'empâtage par défaut (L d'eau par kg de grain). */
export const DEFAULT_MASH_RATIO = 3.0;
/** Absorption d'eau retenue par la drêche (L/kg). */
export const GRAIN_ABSORPTION = 1.0;

// ─────────────────────────────────────────────────────────────────────────────
// Masse (unité interne : gramme)
// ─────────────────────────────────────────────────────────────────────────────

/** Grammes → kilogrammes. */
export function gToKg(g: number): number {
  return g / 1000;
}

/** Kilogrammes → grammes. */
export function kgToG(kg: number): number {
  return kg * 1000;
}

/** Grammes → livres. */
export function gToLb(g: number): number {
  return g / GRAMS_PER_POUND;
}

/** Livres → grammes. */
export function lbToG(lb: number): number {
  return lb * GRAMS_PER_POUND;
}

/** Grammes → milligrammes. */
export function gToMg(g: number): number {
  return g * 1000;
}

/** Milligrammes → grammes. */
export function mgToG(mg: number): number {
  return mg / 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume (unité interne : litre)
// ─────────────────────────────────────────────────────────────────────────────

/** Litres → gallons US. */
export function lToGal(l: number): number {
  return l / LITERS_PER_GALLON;
}

/** Gallons US → litres. */
export function galToL(gal: number): number {
  return gal * LITERS_PER_GALLON;
}

// ─────────────────────────────────────────────────────────────────────────────
// Température (unité interne : °C)
// ─────────────────────────────────────────────────────────────────────────────

/** Celsius → Fahrenheit. */
export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** Fahrenheit → Celsius. */
export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

// ─────────────────────────────────────────────────────────────────────────────
// Densité ↔ points (unité interne : SG brute)
// ─────────────────────────────────────────────────────────────────────────────

/** SG brute → points de densité : `points = (SG − 1) × 1000`. */
export function points(sg: number): number {
  return (sg - 1) * 1000;
}

/** Points de densité → SG brute : `SG = 1 + points / 1000`. */
export function sgFromPoints(p: number): number {
  return 1 + p / 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// SG ↔ Plato ↔ Brix
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SG brute → degrés Plato (approximation polynomiale, valable bières, §0.1).
 * `P = −616.868 + 1111.14·SG − 630.272·SG² + 135.997·SG³`.
 */
export function sgToPlato(sg: number): number {
  return -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
}

/**
 * Degrés Plato → SG brute (§0.1).
 * `SG = 1 + P / (258.6 − (P / 258.2) × 227.1)`.
 */
export function platoToSg(p: number): number {
  return 1 + p / (258.6 - (p / 258.2) * 227.1);
}

/**
 * Brix → Plato. Nominalement égaux à trois décimales pour le moût (§0.1) :
 * `Bx ≈ P`. Identité conservée pour la clarté d'intention aux points d'appel.
 */
export function brixToPlato(brix: number): number {
  return brix;
}

/** Plato → Brix (nominalement égaux, §0.1). */
export function platoToBrix(plato: number): number {
  return plato;
}

// ─────────────────────────────────────────────────────────────────────────────
// Couleur (unité interne : EBC ; SRM / °Lovibond à l'affichage)
// ─────────────────────────────────────────────────────────────────────────────

/** SRM → EBC : `EBC = SRM × 1.97`. */
export function srmToEbc(srm: number): number {
  return srm * EBC_PER_SRM;
}

/** EBC → SRM : `SRM = EBC / 1.97`. */
export function ebcToSrm(ebc: number): number {
  return ebc / EBC_PER_SRM;
}

/** Degrés Lovibond → SRM (§0.1) : `SRM = 1.3546 × °L − 0.76`. */
export function lovibondToSrm(lovibond: number): number {
  return 1.3546 * lovibond - 0.76;
}

/** SRM → degrés Lovibond (inverse de §0.1). */
export function srmToLovibond(srm: number): number {
  return (srm + 0.76) / 1.3546;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pression (unité interne : bar)
// ─────────────────────────────────────────────────────────────────────────────

/** PSI → bar : `bar = PSI × 0.0689476`. */
export function psiToBar(psi: number): number {
  return psi * BAR_PER_PSI;
}

/** Bar → PSI : `PSI = bar / 0.0689476`. */
export function barToPsi(bar: number): number {
  return bar / BAR_PER_PSI;
}
