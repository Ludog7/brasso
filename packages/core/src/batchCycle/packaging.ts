/**
 * Répartition d'un volume conditionné en contenants (M9-08).
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` **§13.3**. Pur & déterministe
 * (ADR-03). Unités : **litres** partout (jamais de centilitres dans les calculs).
 *
 * Le résultat est une **proposition d'aide à la saisie** : les quantités
 * réellement enregistrées restent celles saisies par l'opérateur. `core` propose,
 * l'atelier dispose — une bouteille ratée ou un fût à moitié rempli ne se déduit
 * d'aucune formule.
 */

/** Contenant servi depuis le volume (bouteille, fût…). */
export interface ContainerSpec {
  /** Identifiant libre repris tel quel dans la sortie (article de catalogue, code…). */
  readonly id: string;
  /** Contenance unitaire en **litres**. */
  readonly volumeL: number;
}

/** Part attribuée à un contenant dans la répartition proposée. */
export interface ContainerAllocation {
  readonly id: string;
  readonly volumeL: number;
  /** Nombre d'unités entières remplies — on ne conditionne pas 2,5 bouteilles. */
  readonly quantity: number;
  /** Volume employé par ces unités (L) : `quantity × volumeL`. */
  readonly usedL: number;
}

/** Proposition de répartition d'un volume en contenants (FORMULES §13.3). */
export interface PackagingSplit {
  readonly allocations: readonly ContainerAllocation[];
  /** Volume total employé (L). */
  readonly usedL: number;
  /**
   * Reste non conditionné (L) — **conservé et affiché**, jamais arrondi ni
   * absorbé : c'est un volume réel, qui part en dégustation ou en perte, et
   * l'escamoter fausserait le rendement de conditionnement (§13.2).
   */
  readonly remainderL: number;
}

/**
 * Tolérance (L) absorbant les erreurs d'arithmétique flottante. Sans elle,
 * `0,3 L / 0,1 L` vaut `2,9999999999999996` et proposerait **2** bouteilles au
 * lieu de 3. Un nanolitre est très en deçà de toute réalité d'atelier.
 */
const EPSILON_L = 1e-9;

/** Arrondit au microlitre : évite un reste de `-5,5e-17` affiché comme un volume. */
function roundL(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Nombre fini strictement positif, sinon `undefined`. */
function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Propose la répartition d'un volume en contenants (FORMULES §13.3).
 *
 * **Répartition descendante** : les plus grands contenants d'abord, le reste
 * finissant dans les plus petits. On remplit ainsi le minimum de contenants, ce
 * qui correspond à la pratique d'atelier — et non l'ordre dans lequel l'appelant
 * a listé les contenants, qui n'a aucune raison d'être significatif.
 *
 * Un contenant de contenance nulle, négative ou non finie est **ignoré** : il
 * absorberait une division par zéro et proposerait une infinité d'unités.
 *
 * @param volumeL volume disponible à répartir (L)
 * @returns la répartition proposée et le reste non conditionné
 */
export function splitIntoContainers(
  volumeL: number,
  containers: readonly ContainerSpec[],
): PackagingSplit {
  const available = positive(volumeL);
  if (available === undefined) {
    return { allocations: [], usedL: 0, remainderL: Math.max(0, roundL(volumeL) || 0) };
  }

  // Décroissant par contenance ; à égalité, l'ordre d'entrée est conservé pour
  // que la sortie reste stable et testable.
  const usable = containers
    .map((c, index) => ({ container: c, index, volumeL: positive(c.volumeL) }))
    .filter((c): c is { container: ContainerSpec; index: number; volumeL: number } => {
      return c.volumeL !== undefined;
    })
    .sort((a, b) => b.volumeL - a.volumeL || a.index - b.index);

  const allocations: ContainerAllocation[] = [];
  let remaining = available;

  for (const { container, volumeL: capacity } of usable) {
    const quantity = Math.floor(remaining / capacity + EPSILON_L);
    if (quantity <= 0) continue;
    const usedL = roundL(quantity * capacity);
    allocations.push({ id: container.id, volumeL: capacity, quantity, usedL });
    remaining = roundL(remaining - usedL);
  }

  const usedL = roundL(allocations.reduce((sum, a) => sum + a.usedL, 0));
  return { allocations, usedL, remainderL: Math.max(0, roundL(available - usedL)) };
}
