/**
 * Formatage des durées et mesures du dérouleur Jour J (M4-10/11). Unités internes
 * (CLAUDE.md) ; l'affichage humanise en `m:ss` pour le compte à rebours, en minutes
 * arrondies pour les rampes, et par type pour les mesures (densité 3 décimales, etc.).
 */

import type { MeasurementKind } from "@brasso/core";

/** Durée (min) → `m:ss` (secondes bornées à ≥ 0). Ex. `1.5` → `"1:30"`. */
export function formatMinSec(minutes: number): string {
  const totalSec = Math.max(0, Math.round(minutes * 60));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Durée (min) arrondie au dixième, ou `—` si inconnue. Ex. `14.97` → `"15 min"`. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  return `${Math.round(minutes * 10) / 10} min`;
}

/** Valeur d'une mesure, formatée selon son type (unité + précision d'affichage). */
export function formatMeasurement(kind: MeasurementKind, value: number): string {
  switch (kind) {
    case "density":
      return value.toFixed(3);
    case "volume":
      return `${Math.round(value * 10) / 10} L`;
    case "temperature":
      return `${Math.round(value * 10) / 10} °C`;
    case "ph":
      return value.toFixed(2);
  }
}
