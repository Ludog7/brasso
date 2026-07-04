/**
 * Amertume (IBU) — méthodes Tinseth (défaut) et Rager, règles par type d'ajout.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §4. En cas de divergence code ↔
 * document, le document fait foi (CLAUDE.md).
 *
 * Amertume du moteur BEER uniquement (non pertinent ALT/SOFT). Dépend de la
 * densité d'ébullition `boilGravity` (M1-04, §4.2). Fonctions pures (ADR-03).
 *
 * Unités internes (CLAUDE.md / `units.ts`) : masse en g, volume en L, acides alpha
 * en fraction (0.062 pour 6,2 %). La conversion g→mg passe par `gToMg` (units.ts).
 */

import { gToMg } from "../units.js";

// ─────────────────────────────────────────────────────────────────────────────
// Coefficients Tinseth (§4.1) et Rager (§4.5).
// ─────────────────────────────────────────────────────────────────────────────

/** Facteur de « bigness » Tinseth (§4.1). */
export const TINSETH_BIGNESS_FACTOR = 1.65;
/** Base exponentielle du facteur densité Tinseth (§4.1). */
export const TINSETH_BIGNESS_BASE = 0.000125;
/** Coefficient de décroissance temporelle Tinseth (§4.1). */
export const TINSETH_TIME_DECAY = 0.04;
/** Normalisateur du facteur temps Tinseth (§4.1). */
export const TINSETH_TIME_NORMALIZER = 4.15;

/** Utilisation de base Rager (%) (§4.5). */
export const RAGER_UTIL_BASE = 18.11;
/** Amplitude de la tangente hyperbolique Rager (%) (§4.5). */
export const RAGER_UTIL_AMPLITUDE = 13.86;
/** Décalage temporel Rager (min) (§4.5). */
export const RAGER_TIME_OFFSET = 31.32;
/** Échelle temporelle Rager (min) (§4.5). */
export const RAGER_TIME_SCALE = 18.27;
/** Seuil de densité déclenchant le « gravity adjustment » Rager (§4.5). */
export const RAGER_GRAVITY_THRESHOLD = 1.05;
/** Diviseur du « gravity adjustment » Rager (§4.5). */
export const RAGER_GRAVITY_DIVISOR = 0.2;

// ─────────────────────────────────────────────────────────────────────────────
// Corrections configurables (§4.3 règles par `use`, §4.4 forme/sachet).
// ─────────────────────────────────────────────────────────────────────────────

/** Facteur d'utilisation whirlpool / hop_stand (§4.3). */
export const DEFAULT_WHIRLPOOL_FACTOR = 0.5;
/** Facteur first_wort (§4.3) : bonus ~+10 % optionnel, désactivé par défaut. */
export const DEFAULT_FIRST_WORT_FACTOR = 1.0;
/** Facteur d'utilisation des pellets (§4.4). */
export const DEFAULT_PELLET_FACTOR = 1.1;
/** Facteur d'utilisation en sachet / bag (§4.4). */
export const DEFAULT_BAG_FACTOR = 0.9;

/** Type d'ajout de houblon (§4.3). */
export type HopUse = "boil" | "first_wort" | "whirlpool" | "hop_stand" | "dry_hop";

/** Forme du houblon (correction d'utilisation, §4.4). */
export type HopForm = "pellet" | "cryo" | "leaf" | "plug";

/** Méthode de calcul de l'IBU (§4.6). */
export type IbuMethod = "tinseth" | "rager";

/** Un ajout de houblon et ses paramètres d'amertume. */
export interface HopAddition {
  /** Acides alpha en fraction (ex. 0.062 pour 6,2 %). */
  readonly alphaFraction: number;
  /** Masse en grammes (unité interne). */
  readonly amountG: number;
  /** Durée d'ébullition restante pour cet ajout (min). */
  readonly timeMin: number;
  /** Type d'ajout (§4.3). */
  readonly use: HopUse;
  /** Forme du houblon (§4.4). Absente → aucune correction de forme. */
  readonly form?: HopForm;
  /** Ajout en sachet / bag (§4.4) → utilisation réduite. */
  readonly bagged?: boolean;
}

/** Facteurs de correction configurables (§4.3, §4.4). */
export interface IbuOptions {
  /** Facteur whirlpool / hop_stand (défaut {@link DEFAULT_WHIRLPOOL_FACTOR}). */
  readonly whirlpoolFactor?: number;
  /** Facteur first_wort (défaut {@link DEFAULT_FIRST_WORT_FACTOR}). */
  readonly firstWortFactor?: number;
  /** Facteur pellets (défaut {@link DEFAULT_PELLET_FACTOR}). */
  readonly pelletFactor?: number;
  /** Facteur sachet / bag (défaut {@link DEFAULT_BAG_FACTOR}). */
  readonly bagFactor?: number;
}

interface ResolvedOptions {
  readonly whirlpoolFactor: number;
  readonly firstWortFactor: number;
  readonly pelletFactor: number;
  readonly bagFactor: number;
}

/** Utilisation Tinseth d'un ajout (§4.1), hors corrections de forme/`use`. */
function tinsethBaseIbu(a: HopAddition, boilGravity: number, batchVolumeL: number): number {
  const bigness = TINSETH_BIGNESS_FACTOR * TINSETH_BIGNESS_BASE ** (boilGravity - 1);
  const timeFactor = (1 - Math.exp(-TINSETH_TIME_DECAY * a.timeMin)) / TINSETH_TIME_NORMALIZER;
  const util = bigness * timeFactor;
  const mgAlphaPerL = gToMg(a.alphaFraction * a.amountG) / batchVolumeL;
  return mgAlphaPerL * util;
}

/** Utilisation Rager d'un ajout (§4.5), hors corrections de forme/`use`. */
function ragerBaseIbu(a: HopAddition, boilGravity: number, batchVolumeL: number): number {
  const utilPct =
    RAGER_UTIL_BASE +
    RAGER_UTIL_AMPLITUDE * Math.tanh((a.timeMin - RAGER_TIME_OFFSET) / RAGER_TIME_SCALE);
  const gravityAdjust =
    boilGravity > RAGER_GRAVITY_THRESHOLD
      ? (boilGravity - RAGER_GRAVITY_THRESHOLD) / RAGER_GRAVITY_DIVISOR
      : 0;
  return (
    gToMg(a.amountG * (utilPct / 100) * a.alphaFraction) / (batchVolumeL * (1 + gravityAdjust))
  );
}

/** Facteur d'utilisation selon le type d'ajout (§4.3). `dry_hop` → 0 (IBU nulle). */
function useFactor(use: HopUse, opts: ResolvedOptions): number {
  switch (use) {
    case "boil":
      return 1;
    case "first_wort":
      return opts.firstWortFactor;
    case "whirlpool":
    case "hop_stand":
      return opts.whirlpoolFactor;
    case "dry_hop":
      return 0;
  }
}

/** Facteur d'utilisation selon la forme et le conditionnement (§4.4). */
function correctionFactor(a: HopAddition, opts: ResolvedOptions): number {
  const form = a.form === "pellet" ? opts.pelletFactor : 1;
  const bag = a.bagged ? opts.bagFactor : 1;
  return form * bag;
}

/**
 * Amertume totale (IBU) d'une liste d'ajouts — FORMULES §4.
 *
 * Pour chaque ajout : IBU de base (Tinseth §4.1 ou Rager §4.5) × facteur de `use`
 * (§4.3) × corrections de forme/sachet (§4.4). `dry_hop` ne contribue pas.
 *
 * @param additions    ajouts de houblon (alpha en fraction, masse en g, temps en min).
 * @param boilGravity  densité d'ébullition en SG brute (M1-04, §4.2).
 * @param batchVolumeL volume final visé (L) ; doit être > 0.
 * @param method       méthode de calcul (défaut `tinseth`).
 * @param options      facteurs de correction configurables (§4.3, §4.4).
 * @returns IBU total (somme des contributions).
 * @throws RangeError si `batchVolumeL ≤ 0` (division interdite).
 */
export function calcIbu(
  additions: readonly HopAddition[],
  boilGravity: number,
  batchVolumeL: number,
  method: IbuMethod = "tinseth",
  options?: IbuOptions,
): number {
  if (!(batchVolumeL > 0)) {
    throw new RangeError(
      `calcIbu: batchVolumeL doit être > 0 (reçu ${batchVolumeL}) — division interdite.`,
    );
  }

  const opts: ResolvedOptions = {
    whirlpoolFactor: options?.whirlpoolFactor ?? DEFAULT_WHIRLPOOL_FACTOR,
    firstWortFactor: options?.firstWortFactor ?? DEFAULT_FIRST_WORT_FACTOR,
    pelletFactor: options?.pelletFactor ?? DEFAULT_PELLET_FACTOR,
    bagFactor: options?.bagFactor ?? DEFAULT_BAG_FACTOR,
  };

  let total = 0;
  for (const a of additions) {
    // dry_hop → useFactor renvoie 0 (IBU nulle, §4.3) ; les autres corrections suivent.
    const base =
      method === "rager"
        ? ragerBaseIbu(a, boilGravity, batchVolumeL)
        : tinsethBaseIbu(a, boilGravity, batchVolumeL);
    total += base * useFactor(a.use, opts) * correctionFactor(a, opts);
  }

  return total;
}
