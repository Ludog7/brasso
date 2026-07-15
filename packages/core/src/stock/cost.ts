/**
 * Coût de revient d'un batch (M5-02) — agrégation métier pure, **pas** une formule
 * brassicole (aucune entrée dans FORMULES-BRASSICOLES.md). Base = coût de référence
 * catalogue (`defaultUnitCostCents`) ; le coût lot réel pondéré est reporté en V2
 * (décision de cadrage M5-00). Déterministe, sans dépendance DB/UI (ADR-03).
 * Unités internes : quantités g/L/UNIT, montants en **centimes entiers**.
 */

/**
 * Une ligne de coût : quantité consommée × coût unitaire catalogue.
 * `unitCostCents = null` → coût inconnu (ligne comptée 0, tracée dans `missingCostLines`).
 */
export interface BatchCostLine {
  /** Quantité consommée (unités internes g/L/UNIT), finie ≥ 0. */
  quantity: number;
  /** Coût unitaire catalogue en centimes, fini ≥ 0 ; `null` si inconnu. */
  unitCostCents: number | null;
}

/** Entrée de `computeBatchCost` (M5-02). */
export interface BatchCostInput {
  /** Ingrédients RECETTE consommés par le batch. */
  ingredients: readonly BatchCostLine[];
  /** Conditionnement consommé (bouteilles, capsules, fûts…). */
  conditioning: readonly BatchCostLine[];
  /** Imputation forfaitaire du bulk (centimes), défaut 0. */
  bulkForfaitCents?: number;
  /** Volume du batch (L) pour le coût au litre ; absent/≤0 → `costPerLiterCents` null. */
  batchVolumeL?: number;
  /** Nombre d'unités conditionnées ; absent/≤0 → `costPerPackagedUnitCents` null. */
  packagedUnits?: number;
}

/** Résultat chiffré du coût de revient (centimes entiers). */
export interface BatchCostResult {
  ingredientsCents: number;
  conditioningCents: number;
  bulkCents: number;
  totalCents: number;
  /** Coût au litre ; `null` si `batchVolumeL` absent/≤0. */
  costPerLiterCents: number | null;
  /** Coût à l'unité conditionnée ; `null` si `packagedUnits` absent/≤0. */
  costPerPackagedUnitCents: number | null;
  /** Nombre de lignes à coût inconnu (comptées 0) — traçabilité de l'incomplétude. */
  missingCostLines: number;
}

/** Somme des coûts de lignes, en incrémentant `missing` pour chaque coût inconnu. */
function sumLines(
  lines: readonly BatchCostLine[],
  label: string,
  counter: { missing: number },
): number {
  let total = 0;
  for (const { quantity, unitCostCents } of lines) {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new RangeError(`computeBatchCost: ${label}.quantity doit être un nombre fini ≥ 0.`);
    }
    if (unitCostCents === null) {
      counter.missing += 1;
      continue;
    }
    if (!Number.isFinite(unitCostCents) || unitCostCents < 0) {
      throw new RangeError(
        `computeBatchCost: ${label}.unitCostCents doit être un nombre fini ≥ 0.`,
      );
    }
    total += Math.round(quantity * unitCostCents);
  }
  return total;
}

/**
 * Coût de revient d'un batch : ingrédients recette + conditionnement + bulk forfaitaire,
 * ramené au litre et à l'unité conditionnée. Lignes à coût inconnu comptées 0 et tracées.
 *
 * `RangeError` si une `quantity`/`unitCostCents` est négative ou non finie, ou si
 * `bulkForfaitCents` est négatif ou non fini.
 */
export function computeBatchCost({
  ingredients,
  conditioning,
  bulkForfaitCents = 0,
  batchVolumeL,
  packagedUnits,
}: BatchCostInput): BatchCostResult {
  if (!Number.isFinite(bulkForfaitCents) || bulkForfaitCents < 0) {
    throw new RangeError("computeBatchCost: bulkForfaitCents doit être un nombre fini ≥ 0.");
  }

  const counter = { missing: 0 };
  const ingredientsCents = sumLines(ingredients, "ingredients", counter);
  const conditioningCents = sumLines(conditioning, "conditioning", counter);
  const bulkCents = Math.round(bulkForfaitCents);
  const totalCents = ingredientsCents + conditioningCents + bulkCents;

  const costPerLiterCents =
    batchVolumeL !== undefined && Number.isFinite(batchVolumeL) && batchVolumeL > 0
      ? Math.round(totalCents / batchVolumeL)
      : null;
  const costPerPackagedUnitCents =
    packagedUnits !== undefined && Number.isFinite(packagedUnits) && packagedUnits > 0
      ? Math.round(totalCents / packagedUnits)
      : null;

  return {
    ingredientsCents,
    conditioningCents,
    bulkCents,
    totalCents,
    costPerLiterCents,
    costPerPackagedUnitCents,
    missingCostLines: counter.missing,
  };
}
