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

/**
 * Heure d'un instant (epoch ms) en `HH:MM`, ou `—` si invalide. Le Jour J tient
 * dans une journée : l'heure seule suffit à horodater une mesure à l'écran, et
 * se lit d'un coup d'œil sur une tablette posée à distance.
 */
export function formatClock(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Date/heure d'un ISO 8601 en format court FR (`14/07/2026 10:32`), ou `—` si invalide. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
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
