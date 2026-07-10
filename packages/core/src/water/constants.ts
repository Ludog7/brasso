/**
 * Chimie de l'eau — apports ioniques des sels brassicoles.
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` **Annexe D**. Valeurs en
 * **mg/L par gramme de sel dissous par litre** (ppm par g/L), dérivées des masses
 * molaires (Annexe D.1). Aide à la décision, **jamais prescriptif** (ADR-11) :
 * ces constantes orientent un profil ionique, elles n'attestent d'aucune
 * conformité (potabilité, sécurité).
 */

/** Ions modélisés d'un profil d'eau (mg/L). Ordre **figé** (sérialisation, matrice). */
export const ION_KEYS = [
  "calcium",
  "magnesium",
  "sodium",
  "sulfate",
  "chloride",
  "bicarbonate",
] as const;

export type IonKey = (typeof ION_KEYS)[number];

/** Concentrations ioniques d'une eau (mg/L par ion). */
export type WaterProfileIons = Record<IonKey, number>;

/** Sels brassicoles supportés (Annexe D.2). Ordre figé (colonnes de la matrice). */
export const SALT_KEYS = ["gypsum", "calciumChloride", "epsom", "tableSalt", "bakingSoda"] as const;

export type SaltKey = (typeof SALT_KEYS)[number];

/** Doses de sels (g) — sortie **indicative** de la suggestion. */
export type WaterSaltDosesG = Record<SaltKey, number>;

/**
 * Apport ionique de chaque sel en **mg/L par (g/L)** (Annexe D.2). Un ion absent
 * de l'objet vaut 0. Chaque valeur = `masse molaire de l'ion / masse molaire du
 * sel × 1000` (formes hydratées usuelles).
 */
export const SALT_ION_PPM: Record<SaltKey, Readonly<Partial<WaterProfileIons>>> = {
  // Gypse CaSO₄·2H₂O (172.164) — Ca 40.078, SO₄ 96.056.
  gypsum: { calcium: 232.79, sulfate: 557.94 },
  // Chlorure de calcium CaCl₂·2H₂O (147.008) — Ca 40.078, Cl 70.90.
  calciumChloride: { calcium: 272.62, chloride: 482.29 },
  // Sel d'Epsom MgSO₄·7H₂O (246.466) — Mg 24.305, SO₄ 96.056.
  epsom: { magnesium: 98.61, sulfate: 389.73 },
  // Sel de table NaCl (58.440) — Na 22.990, Cl 35.45.
  tableSalt: { sodium: 393.39, chloride: 606.61 },
  // Bicarbonate de sodium NaHCO₃ (84.006) — Na 22.990, HCO₃ 61.016.
  bakingSoda: { sodium: 273.67, bicarbonate: 726.33 },
};
