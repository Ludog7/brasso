/**
 * Densités du moût — OG (initiale), FG (finale), boil gravity (ébullition).
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` §1 (OG), §2 (FG), §4.2 (boil
 * gravity). En cas de divergence code ↔ document, le document fait foi (CLAUDE.md).
 *
 * Ces valeurs sont la base de tout le moteur BEER : l'ABV (M1-05) et l'IBU (M1-06)
 * les consomment. Fonctions pures (ADR-03) ; les avertissements de plausibilité
 * sont émis via un callback `warn` injecté — aucune dépendance console / UI / DB.
 *
 * Unités internes (CLAUDE.md / `units.ts`) : masse en g, volume en L, densité en
 * SG brute (ex. 1.052). Les conversions vivent exclusivement dans `units.ts`.
 */

import { gToKg, points, sgFromPoints } from "../units.js";

// ─────────────────────────────────────────────────────────────────────────────
// Bornes de plausibilité — FORMULES §1.3 (rendement) et §2 (atténuation)
// Hors plage → la valeur est bornée (clamp) et un avertissement est émis.
// ─────────────────────────────────────────────────────────────────────────────

/** Rendement de brassage plausible, borne basse (%). */
export const EFFICIENCY_MIN_PCT = 50;
/** Rendement de brassage plausible, borne haute (%). */
export const EFFICIENCY_MAX_PCT = 95;
/** Atténuation apparente plausible, borne basse (%). */
export const ATTENUATION_MIN_PCT = 50;
/** Atténuation apparente plausible, borne haute (%). */
export const ATTENUATION_MAX_PCT = 95;

/**
 * Callback d'avertissement de plausibilité (valeur hors plage, bornée).
 * Injecté pour garder les calculs purs (ADR-03) : la couche appelante décide
 * quoi en faire (log, remontée UI…). Omis → l'avertissement est silencieux.
 */
export type WarnFn = (message: string) => void;

/**
 * Un fermentescible et son potentiel d'extrait.
 *
 * `potentialSg` suit la convention du référentiel (§1.2) : SG brute d'1 kg dilué
 * dans 1 L (ex. malt Pale ≈ 1.037 → 37 points/kg/L). Le rendement d'empâtage ne
 * s'applique qu'aux grains empâtés (`isMashable`) ; sucres et extraits
 * liquides/secs comptent à 100 %.
 */
export interface Fermentable {
  /** Potentiel d'extrait en SG brute (ex. 1.037). */
  readonly potentialSg: number;
  /** Masse en grammes (unité interne). */
  readonly amountG: number;
  /** Grain empâté (le rendement s'applique) vs sucre/extrait ajouté (100 %). */
  readonly isMashable: boolean;
}

/**
 * Borne `value` à `[min, max]` et avertit si un débordement a eu lieu.
 * FORMULES §1.3/§2 : « borner … avertir hors plage ».
 */
function clampWithWarning(
  value: number,
  min: number,
  max: number,
  label: string,
  warn?: WarnFn,
): number {
  if (value < min || value > max) {
    const clamped = Math.min(max, Math.max(min, value));
    warn?.(`${label} = ${value} hors plage plausible [${min}, ${max}] ; borné à ${clamped}.`);
    return clamped;
  }
  return value;
}

/**
 * Densité initiale (OG) — FORMULES §1.
 *
 * Pour chaque fermentescible : `contribPoints = points(potentialSg) × massKg ×
 * (isMashable ? eff : 1)`, puis `OG = 1 + (Σ contribPoints / batchVolumeL) / 1000`.
 *
 * @param fermentables  grist (potentiel, masse en g, empâté ou non).
 * @param efficiencyPct rendement de brassage (%), borné à [50, 95] (§1.3).
 * @param batchVolumeL  volume final visé (L) ; doit être > 0.
 * @param warn          avertissement de plausibilité (optionnel).
 * @returns OG en SG brute (ex. 1.052). Grist vide → 1.000 (§1.3).
 * @throws RangeError si `batchVolumeL ≤ 0` (division interdite, §1.3).
 */
export function calcOg(
  fermentables: readonly Fermentable[],
  efficiencyPct: number,
  batchVolumeL: number,
  warn?: WarnFn,
): number {
  if (!(batchVolumeL > 0)) {
    throw new RangeError(
      `calcOg: batchVolumeL doit être > 0 (reçu ${batchVolumeL}) — division interdite (FORMULES §1.3).`,
    );
  }

  const eff =
    clampWithWarning(efficiencyPct, EFFICIENCY_MIN_PCT, EFFICIENCY_MAX_PCT, "efficiencyPct", warn) /
    100;

  let contribPoints = 0;
  for (const f of fermentables) {
    const factor = f.isMashable ? eff : 1;
    contribPoints += points(f.potentialSg) * gToKg(f.amountG) * factor;
  }

  return sgFromPoints(contribPoints / batchVolumeL);
}

/**
 * Densité finale (FG) — FORMULES §2.
 *
 * `FG = 1 + (OG_points × (1 − attén)) / 1000`, atténuation apparente de la levure
 * dominante. `ogPoints` = points de densité de l'OG (`points(og)` de `units.ts`).
 *
 * @param ogPoints       points de densité de l'OG (ex. 52 pour 1.052).
 * @param attenuationPct atténuation apparente (%), bornée à [50, 95] (§2).
 * @param warn           avertissement de plausibilité (optionnel).
 * @returns FG en SG brute (ex. 1.013).
 */
export function calcFg(ogPoints: number, attenuationPct: number, warn?: WarnFn): number {
  const atten =
    clampWithWarning(
      attenuationPct,
      ATTENUATION_MIN_PCT,
      ATTENUATION_MAX_PCT,
      "attenuationPct",
      warn,
    ) / 100;

  return sgFromPoints(ogPoints * (1 - atten));
}

/**
 * Densité pendant l'ébullition (boil gravity) — FORMULES §4.2.
 *
 * OG rapportée au volume d'ébullition (nécessaire au calcul de l'IBU, M1-06) :
 * `boilGravity = 1 + (OG_points × batchVolumeL / boilVolumeL) / 1000`.
 *
 * @param ogPoints     points de densité de l'OG (ex. 40 pour 1.040).
 * @param batchVolumeL volume final visé (L).
 * @param boilVolumeL  volume en début d'ébullition (L) ; doit être > 0.
 * @returns boil gravity en SG brute.
 * @throws RangeError si `boilVolumeL ≤ 0` (division interdite, §4.2).
 */
export function boilGravity(ogPoints: number, batchVolumeL: number, boilVolumeL: number): number {
  if (!(boilVolumeL > 0)) {
    throw new RangeError(
      `boilGravity: boilVolumeL doit être > 0 (reçu ${boilVolumeL}) — division interdite (FORMULES §4.2).`,
    );
  }

  return sgFromPoints((ogPoints * batchVolumeL) / boilVolumeL);
}
