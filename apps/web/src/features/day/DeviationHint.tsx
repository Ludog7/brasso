/**
 * Écart **indicatif** d'une mesure au modèle (M4-11, « Gestion des alertes »). Compare
 * la valeur relevée à la cible (`modelTarget`) et signale l'écart au-delà d'une
 * tolérance. Wording d'**aide à la décision** (ADR-11) : on affiche l'écart, jamais
 * un verdict « conforme »/« sûr ». `null` si aucune cible modèle connue.
 */

import type { MeasurementKind } from "@brasso/core";

import { formatMeasurement } from "@/features/day/format";
import { DEVIATION_TOLERANCE } from "@/features/day/model";
import { Badge } from "@/ui/badge";

export function DeviationHint({
  kind,
  value,
  target,
}: {
  kind: MeasurementKind;
  value: number;
  target: number | undefined;
}) {
  if (target === undefined) return null;

  const delta = value - target;
  const beyond = Math.abs(delta) > DEVIATION_TOLERANCE[kind];
  const sign = delta >= 0 ? "+" : "−";
  const model = formatMeasurement(kind, target);

  const label = beyond
    ? `Écart ${sign}${formatMeasurement(kind, Math.abs(delta))} vs modèle ${model}`
    : `Proche du modèle (${model})`;

  return (
    <Badge tone={beyond ? "accent" : "muted"} role="status">
      {label}
    </Badge>
  );
}
