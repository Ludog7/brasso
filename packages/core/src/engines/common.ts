/**
 * Briques partagées des moteurs — jauges BJCP, indicateur pH, publication.
 *
 * **ADR-11** : sur les écrans pH/stabilisation, on parle d'**indicateur d'aide à
 * la décision**, jamais de « conforme » / « sûr ». Les sorties portent donc un
 * statut de type `indicator` accompagné du disclaimer imposé — jamais un booléen
 * « safe/conforme ». Fonctions pures (ADR-03).
 */

/**
 * Seuil pH « low-acid » (§ sécurité microbiologique) : au-dessus de 4.6, la
 * boisson entre dans la zone des « low-acid foods » exigeant des contrôles.
 */
export const PH_LOW_ACID_THRESHOLD = 4.6;

/** Disclaimer permanent imposé sur les écrans pH/stabilisation (ADR-11). */
export const FOOD_SAFETY_DISCLAIMER =
  "Indicateur d'aide à la décision — ne remplace pas une validation d'hygiène alimentaire professionnelle.";

/** Position d'une valeur par rapport à une plage cible (jauge BJCP). */
export type GaugeStatus = "below" | "in_range" | "above" | "unknown";

/**
 * Statut d'une valeur vis-à-vis d'une plage `[min, max]` (bornes optionnelles).
 * Sans borne du tout → `unknown` (pas de style de référence).
 */
export function gaugeStatus(value: number, min?: number, max?: number): GaugeStatus {
  if (min === undefined && max === undefined) return "unknown";
  if (min !== undefined && value < min) return "below";
  if (max !== undefined && value > max) return "above";
  return "in_range";
}

/**
 * Statut pH — description de la mesure, **jamais** un verdict « conforme » (ADR-11) :
 * `acidic` (pH ≤ 4.6) ou `low_acid` (pH > 4.6, zone de vigilance).
 */
export type PhStatus = "acidic" | "low_acid";

/** Indicateur pH — aide à la décision (ADR-11), jamais un booléen « safe ». */
export interface PhIndicator {
  readonly kind: "indicator";
  readonly ph: number;
  readonly threshold: number;
  readonly status: PhStatus;
  readonly disclaimer: string;
}

/** Construit l'indicateur pH pour une mesure donnée. */
export function phIndicator(ph: number): PhIndicator {
  return {
    kind: "indicator",
    ph,
    threshold: PH_LOW_ACID_THRESHOLD,
    status: ph <= PH_LOW_ACID_THRESHOLD ? "acidic" : "low_acid",
    disclaimer: FOOD_SAFETY_DISCLAIMER,
  };
}

/** Résultat d'une validation de publication `core` (ADR-06). */
export interface PublicationCheck {
  /** Publiable du point de vue des règles `core` (hors contrôles DB/UI). */
  readonly publishable: boolean;
  /** Motifs de blocage (vide si publiable). */
  readonly errors: readonly string[];
}
