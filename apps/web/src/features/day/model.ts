/**
 * Valeurs **modèle** d'une étape Jour J (M4-11) — cibles issues du `recipeSnapshot`
 * figé (la recette publiée, M3) et du plan, pour comparer les mesures relevées et
 * signaler un **écart indicatif** (aide à la décision, ADR-11 — jamais « conforme »).
 *
 * Le snapshot est du JSON **opaque** (JSONB) : lecture **défensive** comme
 * `buildDayPlan` (un champ absent/mal typé → `undefined`, jamais d'exception).
 */

import type { MeasurementKind, StepSpec } from "@brasso/core";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** OG cible de la recette (moteur BEER) — référence indicative pour la densité. */
function targetOg(snapshot: unknown): number | undefined {
  const beer = asRecord(asRecord(snapshot)?.beerDetails);
  return beer ? finiteNumber(beer.targetOg) : undefined;
}

/** Volume de brassin cible (premier bloc moteur qui le porte). */
function batchVolume(snapshot: unknown): number | undefined {
  const snap = asRecord(snapshot);
  for (const key of ["beerDetails", "altDetails", "softDetails"] as const) {
    const details = asRecord(snap?.[key]);
    const volume = details ? finiteNumber(details.batchVolumeL) : undefined;
    if (volume !== undefined) return volume;
  }
  return undefined;
}

/**
 * Cible modèle pour un type de mesure sur l'étape courante, ou `undefined` si
 * inconnue. La température vient du plan (`targetTempC`), la densité/volume du
 * snapshot. Le pH n'est pas comparé ici (hors mesures requises du brassin, évite
 * l'écran pH/sécurité alimentaire ADR-11).
 */
export function modelTarget(
  snapshot: unknown,
  step: StepSpec,
  kind: MeasurementKind,
): number | undefined {
  switch (kind) {
    case "temperature":
      return step.targetTempC;
    case "density":
      return targetOg(snapshot);
    case "volume":
      return batchVolume(snapshot);
    case "ph":
      return undefined;
  }
}

/**
 * Tolérance avant de **signaler** un écart au modèle (indicatif). En deçà, la mesure
 * est présentée comme proche du modèle ; au-delà, l'écart est mis en avant.
 */
export const DEVIATION_TOLERANCE: Record<MeasurementKind, number> = {
  density: 0.003,
  volume: 1,
  temperature: 1,
  ph: 0.1,
};
