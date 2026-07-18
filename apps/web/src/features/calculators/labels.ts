/**
 * Libellés & unités des calculateurs d'atelier (M8-02). Chaîne d'affichage
 * **uniquement** : les formules et les unités internes vivent dans `@brasso/core`
 * ({{M8-01}}). Sert aussi à traduire un chemin d'erreur Zod en libellé de champ.
 */

/** Descripteur d'un champ de saisie : libellé accessible + unité affichée. */
export interface FieldLabel {
  label: string;
  unit: string;
}

/** Forme minimale d'une erreur Zod — évite une dépendance directe à `zod` côté web. */
interface ZodLikeError {
  issues: ReadonlyArray<{ path: ReadonlyArray<string | number> }>;
}

export const STARTER_LABELS = {
  og: { label: "Densité initiale (OG)", unit: "SG" },
  volumeL: { label: "Volume de moût", unit: "L" },
  style: { label: "Style", unit: "" },
  pitchRate: { label: "Taux d'inoculation (optionnel)", unit: "M/mL/°P" },
  packs: { label: "Unités de levure", unit: "sachets" },
  cellsPerPackB: { label: "Cellules par unité", unit: "×10⁹" },
  viability: { label: "Viabilité", unit: "0–1" },
} as const satisfies Record<string, FieldLabel>;

export const WATER_LABELS = {
  grainKg: { label: "Masse de grain", unit: "kg" },
  mashRatioLPerKg: { label: "Ratio d'empâtage", unit: "L/kg" },
  boilVolumeL: { label: "Volume pré-ébullition", unit: "L" },
  deadSpaceL: { label: "Volume mort", unit: "L" },
  targetTempC: { label: "Température de palier visée", unit: "°C" },
  grainTempC: { label: "Température des grains", unit: "°C" },
} as const satisfies Record<string, FieldLabel>;

export const BIAB_LABELS = {
  grainKg: { label: "Masse de grain", unit: "kg" },
  boilVolumeL: { label: "Volume pré-ébullition", unit: "L" },
  deadSpaceL: { label: "Volume mort", unit: "L" },
  grainAbsorptionLPerKg: { label: "Absorption du grain", unit: "L/kg" },
  targetTempC: { label: "Température de palier visée", unit: "°C" },
  grainTempC: { label: "Température des grains", unit: "°C" },
} as const satisfies Record<string, FieldLabel>;

export const DILUTION_LABELS = {
  currentSg: { label: "Densité actuelle", unit: "SG" },
  currentVolumeL: { label: "Volume actuel", unit: "L" },
  targetSg: { label: "Densité cible", unit: "SG" },
} as const satisfies Record<string, FieldLabel>;

/**
 * Traduit les erreurs Zod en libellés de champs concernés (sans doublon), pour un
 * message utilisateur clair sans exposer les messages techniques.
 */
export function invalidFieldLabels(
  error: ZodLikeError,
  labels: Record<string, FieldLabel>,
): string[] {
  const keys = new Set(error.issues.map((issue) => String(issue.path[0] ?? "")));
  return [...keys].map((key) => labels[key]?.label ?? key).filter((label) => label.length > 0);
}
