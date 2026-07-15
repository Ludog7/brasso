/**
 * Calculs purs de stock (M5-01, §3.3) — niveau dérivé du registre append-only,
 * ajustement d'une quantité au volume réel, évaluation du seuil de réappro.
 * Zéro dépendance DB/UI (ADR-03) ; unités internes (g/L/UNIT).
 */

import type { CatalogKind } from "../schemas/enums.js";

/** Un mouvement de stock réduit à son `delta` signé (registre append-only). */
export interface StockMovementDelta {
  delta: number;
}

/**
 * Niveau de stock courant = somme signée des `delta` du registre append-only
 * (`StockMovement`, M1-01, « la quantité courante se dérive des mouvements »).
 * Registre vide → 0.
 */
export function deriveStockLevel(movements: readonly StockMovementDelta[]): number {
  return movements.reduce((sum, m) => sum + m.delta, 0);
}

/**
 * Ajuste une quantité **planifiée** au **volume réel** d'un batch (déduction
 * effective à l'ensemencement, §Stock). Proportionnel :
 * `plannedQty × actualVolumeL / plannedVolumeL`.
 *
 * - `actualVolumeL` absent/`null` → aucun ajustement (renvoie `plannedQty`).
 * - `RangeError` si `plannedVolumeL ≤ 0`, ou si une entrée est non finie / négative.
 */
export function scaleQuantityToVolume(
  plannedQty: number,
  plannedVolumeL: number,
  actualVolumeL?: number | null,
): number {
  if (!Number.isFinite(plannedQty) || plannedQty < 0) {
    throw new RangeError("scaleQuantityToVolume: plannedQty doit être un nombre fini ≥ 0.");
  }
  if (actualVolumeL === undefined || actualVolumeL === null) {
    return plannedQty;
  }
  if (!Number.isFinite(plannedVolumeL) || plannedVolumeL <= 0) {
    throw new RangeError("scaleQuantityToVolume: plannedVolumeL doit être un nombre fini > 0.");
  }
  if (!Number.isFinite(actualVolumeL) || actualVolumeL < 0) {
    throw new RangeError("scaleQuantityToVolume: actualVolumeL doit être un nombre fini ≥ 0.");
  }
  return (plannedQty * actualVolumeL) / plannedVolumeL;
}

/** Entrée de l'évaluation du seuil de réappro (M5-01, §3.3). */
export interface ReorderInput {
  kind: CatalogKind;
  /** Niveau courant dérivé du registre (`deriveStockLevel`). */
  level: number;
  /** Réservations `RESERVED` en cours — pertinent pour les articles `RECETTE`. */
  reserved?: number;
  /** Seuil de réappro configuré ; `null`/absent → pas d'alerte. */
  threshold?: number | null;
}

/** Résultat : disponible net et franchissement du seuil. */
export interface ReorderResult {
  available: number;
  below: boolean;
}

/**
 * Évalue le seuil de réappro, **différencié par `kind`** (§3.3) :
 * - `RECETTE` : disponible net des réservations (`level − reserved`).
 * - `BULK` / `CONDITIONNEMENT` : disponible = `level` (pas de réservation).
 *
 * `threshold` absent/`null` → jamais d'alerte ; sinon alerte si `available ≤ threshold`.
 */
export function evaluateReorder({
  kind,
  level,
  reserved = 0,
  threshold,
}: ReorderInput): ReorderResult {
  const available = kind === "RECETTE" ? level - reserved : level;
  const below = threshold !== undefined && threshold !== null && available <= threshold;
  return { available, below };
}
