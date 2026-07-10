/**
 * Suggestion d'ajouts de sels brassicoles (M3-02, FORMULES **Annexe D.3**).
 *
 * D'un profil d'eau de `base`, d'une `cible` et d'un volume, dérive des doses (g)
 * **indicatives** de sels minimisant l'écart ionique, l'écart résiduel par ion et
 * le ratio sulfate/chlorure. **Aide à la décision, jamais prescriptif** (ADR-11) :
 * aucune allégation « conforme »/« potable ». Fonction pure (ADR-03), tout est
 * re-dérivable ; les constantes viennent de `constants.ts` (Annexe D.2).
 */

import {
  ION_KEYS,
  SALT_ION_PPM,
  SALT_KEYS,
  type SaltKey,
  type WaterProfileIons,
  type WaterSaltDosesG,
} from "./constants.js";

/**
 * Nombre de balayages de la descente de coordonnées. Le problème est un moindres
 * carrés non négatif convexe (matrice définie positive) : la descente converge
 * vers l'optimum global ; 500 balayages saturent la précision utile (indicatif).
 */
const MAX_SWEEPS = 500;

/** Résultat de {@link suggestWaterAdditions} — tout est indicatif (ADR-11). */
export interface WaterAdditionSuggestion {
  /** Volume d'eau traité (L). */
  readonly volumeL: number;
  /** Doses de sels (g) minimisant l'écart à la cible. */
  readonly additionsG: WaterSaltDosesG;
  /** Profil obtenu = base + apports des sels (mg/L par ion). */
  readonly achievedProfile: WaterProfileIons;
  /** Écart résiduel = obtenu − cible (mg/L) : > 0 dépassement, < 0 besoin non couvert. */
  readonly residualDelta: WaterProfileIons;
  /** Ratio SO₄/Cl du profil obtenu (indicateur d'équilibre), `null` si Cl = 0. */
  readonly sulfateChlorideRatio: number | null;
}

/** Complète un profil partiel : chaque ion absent vaut 0 (mg/L). */
function toIons(profile: Partial<WaterProfileIons>): WaterProfileIons {
  const ions = {} as WaterProfileIons;
  for (const ion of ION_KEYS) {
    ions[ion] = profile[ion] ?? 0;
  }
  return ions;
}

/**
 * Ratio sulfate/chlorure d'un profil — indicateur d'équilibre gustatif (souligne
 * l'amertume ↔ souligne le malté). `null` si le chlorure est nul (division exclue).
 */
export function sulfateChlorideRatio(profile: {
  readonly sulfate: number;
  readonly chloride: number;
}): number | null {
  return profile.chloride > 0 ? profile.sulfate / profile.chloride : null;
}

/**
 * Suggère les doses de sels (g) qui, ajoutées à `base` dans `volumeL` litres,
 * approchent au mieux la `cible` (Annexe D.3). Résout `min‖A·x − besoin‖²`, `x ≥ 0`
 * (concentrations g/L) par descente de coordonnées, puis `doses = x · volumeL`.
 *
 * @throws RangeError si `volumeL` n'est pas strictement positif.
 */
export function suggestWaterAdditions(
  base: Partial<WaterProfileIons>,
  target: Partial<WaterProfileIons>,
  volumeL: number,
): WaterAdditionSuggestion {
  if (!(volumeL > 0)) {
    throw new RangeError("Le volume d'eau doit être strictement positif (L).");
  }

  const baseIons = toIons(base);
  const targetIons = toIons(target);

  // Besoin ionique (mg/L) et apport de chaque sel (colonne `col`, ppm par g/L) —
  // indexés par clés littérales (sûr sous `noUncheckedIndexedAccess`).
  const need = {} as WaterProfileIons;
  for (const ion of ION_KEYS) {
    need[ion] = targetIons[ion] - baseIons[ion];
  }
  const cols = {} as Record<SaltKey, WaterProfileIons>;
  const colNormSq = {} as Record<SaltKey, number>;
  for (const salt of SALT_KEYS) {
    const col = {} as WaterProfileIons;
    let normSq = 0;
    for (const ion of ION_KEYS) {
      const ppm = SALT_ION_PPM[salt][ion] ?? 0;
      col[ion] = ppm;
      normSq += ppm * ppm;
    }
    cols[salt] = col;
    colNormSq[salt] = normSq;
  }

  // Descente de coordonnées : `x` = concentrations (g/L) ; `predicted` = A·x (mg/L).
  const x = {} as WaterSaltDosesG;
  for (const salt of SALT_KEYS) {
    x[salt] = 0;
  }
  const predicted = {} as WaterProfileIons;
  for (const ion of ION_KEYS) {
    predicted[ion] = 0;
  }
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    for (const salt of SALT_KEYS) {
      const col = cols[salt];
      // Retire la contribution actuelle du sel, optimise sa dose, la réinjecte.
      for (const ion of ION_KEYS) {
        predicted[ion] -= col[ion] * x[salt];
      }
      let numerator = 0;
      for (const ion of ION_KEYS) {
        numerator += col[ion] * (need[ion] - predicted[ion]);
      }
      const dose = Math.max(0, numerator / colNormSq[salt]);
      x[salt] = dose;
      for (const ion of ION_KEYS) {
        predicted[ion] += col[ion] * dose;
      }
    }
  }

  const additionsG = {} as WaterSaltDosesG;
  for (const salt of SALT_KEYS) {
    additionsG[salt] = x[salt] * volumeL;
  }

  const achievedProfile = {} as WaterProfileIons;
  const residualDelta = {} as WaterProfileIons;
  for (const ion of ION_KEYS) {
    const achieved = baseIons[ion] + predicted[ion];
    achievedProfile[ion] = achieved;
    residualDelta[ion] = achieved - targetIons[ion];
  }

  return {
    volumeL,
    additionsG,
    achievedProfile,
    residualDelta,
    sulfateChlorideRatio: sulfateChlorideRatio(achievedProfile),
  };
}
