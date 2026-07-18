/**
 * Chaîne des volumes d'un brassin et rendement de conditionnement (M9-06).
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` **§13.2**. Aucun paramètre
 * nouveau : les pertes viennent du profil d'équipement existant
 * (`deadspaceL`, `transferLossL`, `evaporationRateLPerHour`) — les pertes au
 * whirlpool sont déjà couvertes par les deux premières.
 *
 * Pur & déterministe (ADR-03). Unités internes : **litres** partout, durées en
 * minutes. Aucune conversion locale (elles vivent dans `units.ts`, CLAUDE.md).
 */

/** Pertes du profil d'équipement mobilisées par la chaîne (L, L/h). */
export interface VolumeChainEquipment {
  /** Volume mort / pertes système de la cuve (L). */
  readonly deadspaceL?: number;
  /** Pertes au transfert vers le fermenteur (L). */
  readonly transferLossL?: number;
  /** Taux d'évaporation à l'ébullition (L/h). */
  readonly evaporationRateLPerHour?: number;
}

/**
 * Ligne de conditionnement telle que saisie par l'opérateur : « N contenants de
 * X litres ». Miroir de `BatchPackaging` (M9-02) — le volume unitaire est celui
 * **réellement rempli** le jour du conditionnement, pas la contenance nominale
 * du catalogue (un fût de 20 L peut n'en recevoir que 18).
 */
export interface PackagingLine {
  /** Volume rempli par contenant (L, unité interne — jamais des centilitres). */
  readonly containerVolumeL: number;
  /** Nombre de contenants (entier : on ne conditionne pas 2,5 bouteilles). */
  readonly quantity: number;
}

/** Entrée de {@link batchVolumeChain} : ce qui a été **mesuré**, plus le contexte. */
export interface BatchVolumeChainInput {
  /** Volume pré-ébullition **mesuré** à la filtration (L) — origine de la chaîne. */
  readonly preBoilL?: number;
  /** Volume post-ébullition mesuré (L), s'il l'a été. */
  readonly postBoilL?: number;
  /** Volume transféré mesuré (L), s'il l'a été. */
  readonly transferredL?: number;
  /** Volume **ensemencé** mesuré (L) — relevé au pitching. */
  readonly pitchedL?: number;
  /**
   * Conditionnement : ce que l'opérateur saisit réellement en fin de garde, soit
   * le **nombre de contenants par type** et leur volume rempli. Le volume
   * conditionné s'en déduit — il ne se relève pas en vrac
   * (cf. {@link packagedVolumeFromLines}).
   */
  readonly packaging?: readonly PackagingLine[];
  /** Durée d'ébullition (min) — pilote la perte par évaporation. */
  readonly boilTimeMin?: number;
  readonly equipment?: VolumeChainEquipment;
}

/**
 * Un maillon de la chaîne. `source` porte la **valeur de preuve** : un volume
 * relevé et un volume déduit ne se valent pas, et l'UI doit pouvoir le dire
 * (FORMULES §13.2). `null` quand il n'est ni mesuré, ni estimable faute d'amont.
 */
export interface VolumeStep {
  readonly volumeL: number | null;
  readonly source: "measured" | "estimated" | "unknown";
}

/** Chaîne complète des volumes du brassin (FORMULES §13.2). */
export interface BatchVolumeChain {
  readonly preBoil: VolumeStep;
  readonly postBoil: VolumeStep;
  readonly transferred: VolumeStep;
  readonly pitched: VolumeStep;
  readonly packaged: VolumeStep;
  /** Évaporation estimée (L) sur la durée d'ébullition, ou `null` si inconnue. */
  readonly evaporationL: number | null;
}

/** Nombre fini exploitable, sinon `undefined` (lecture défensive des saisies). */
function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Perte du profil, absente ⇒ 0 : ne pas connaître une perte n'en invente pas une. */
function loss(value: number | undefined): number {
  const n = finite(value);
  return n !== undefined && n > 0 ? n : 0;
}

const measured = (volumeL: number): VolumeStep => ({ volumeL, source: "measured" });
const UNKNOWN: VolumeStep = { volumeL: null, source: "unknown" };

/**
 * Un maillon : la mesure **prime toujours** sur l'estimation (FORMULES §13.2) ;
 * à défaut on estime depuis l'amont, et sans amont exploitable on ne sait pas.
 * Un volume estimé est **borné à 0** — des pertes supérieures à l'amont
 * traduisent une saisie incohérente, pas un volume négatif.
 */
function step(measuredL: number | undefined, estimatedL: number | null): VolumeStep {
  const m = finite(measuredL);
  if (m !== undefined) return measured(m);
  if (estimatedL === null) return UNKNOWN;
  return { volumeL: Math.max(0, estimatedL), source: "estimated" };
}

/**
 * Volume conditionné (L) déduit des contenants saisis : `Σ volume × quantité`.
 *
 * C'est ainsi que la donnée est **constatée** en fin de garde — l'opérateur
 * compte des contenants, il ne relève pas un volume global. La somme a donc la
 * même valeur de preuve qu'une mesure.
 *
 * Lecture défensive : une ligne inexploitable (volume ou quantité non finis,
 * négatifs, quantité non entière) est **ignorée**. Aucune ligne exploitable ⇒
 * `null` — un conditionnement non saisi n'est pas un volume nul.
 */
export function packagedVolumeFromLines(
  lines: readonly PackagingLine[] | undefined,
): number | null {
  if (lines === undefined || lines.length === 0) return null;

  let total = 0;
  let counted = 0;
  for (const line of lines) {
    const volumeL = finite(line?.containerVolumeL);
    const quantity = finite(line?.quantity);
    if (volumeL === undefined || volumeL < 0) continue;
    if (quantity === undefined || quantity < 0 || !Number.isInteger(quantity)) continue;
    total += volumeL * quantity;
    counted += 1;
  }
  return counted === 0 ? null : total;
}

/**
 * Déroule la chaîne des volumes du brassin (FORMULES §13.2) :
 *
 * ```
 * évaporation    = evaporationRateLPerHour × (dureeEbullitionMin / 60)
 * postÉbullition = préÉbullition − évaporation
 * transféré      = postÉbullition − deadspaceL − transferLossL
 * ```
 *
 * Les volumes **ensemencé** et **conditionné** ne s'estiment pas : ils sont
 * constatés — relevé de volume à l'ensemencement, décompte des contenants en
 * fin de garde — ou inconnus. En déduire une valeur reviendrait à inventer une
 * donnée que seul l'opérateur peut établir.
 *
 * Chaque maillon indique s'il est mesuré ou estimé, une mesure primant toujours
 * sur son estimation.
 */
export function batchVolumeChain(input: BatchVolumeChainInput): BatchVolumeChain {
  const preBoil = step(input.preBoilL, null);

  const rate = finite(input.equipment?.evaporationRateLPerHour);
  const boilMin = finite(input.boilTimeMin);
  const evaporationL =
    rate !== undefined && rate >= 0 && boilMin !== undefined && boilMin >= 0
      ? (rate * boilMin) / 60
      : null;

  const postBoil = step(
    input.postBoilL,
    preBoil.volumeL !== null && evaporationL !== null ? preBoil.volumeL - evaporationL : null,
  );

  const transferLosses = loss(input.equipment?.deadspaceL) + loss(input.equipment?.transferLossL);
  const transferred = step(
    input.transferredL,
    postBoil.volumeL !== null ? postBoil.volumeL - transferLosses : null,
  );

  const packagedL = packagedVolumeFromLines(input.packaging);
  return {
    preBoil,
    postBoil,
    transferred,
    pitched: step(input.pitchedL, null),
    packaged: step(packagedL ?? undefined, null),
    evaporationL,
  };
}

/** Résultat de {@link packagingYield}. */
export interface PackagingYield {
  /** Rendement en **pourcentage** (ex. `80` pour 80 %), ou `null` si incalculable. */
  readonly percent: number | null;
  /**
   * Rendement **> 100 %**, physiquement impossible : la valeur est retournée
   * malgré tout, jamais masquée ni écrêtée. C'est le signe d'une saisie erronée
   * et la masquer empêcherait de la corriger (FORMULES §13.2).
   */
  readonly warning?: string;
}

/**
 * Rendement de conditionnement (FORMULES §13.2) :
 *
 * ```
 * rendement (%) = 100 × volumeConditionné / volumePréÉbullition
 * ```
 *
 * ⚠️ À ne **pas** confondre avec `realEfficiency` (§9.1), qui mesure l'extraction
 * des **sucres** (points de densité obtenus / théoriques). Celui-ci mesure la
 * conservation du **volume** à travers les pertes du process : deux indicateurs
 * distincts, deux dénominateurs distincts.
 *
 * Volume pré-ébullition nul, négatif ou absent ⇒ `percent: null` : jamais de
 * division par zéro, jamais d'exception.
 */
export function packagingYield(
  preBoilL: number | null | undefined,
  packagedL: number | null | undefined,
): PackagingYield {
  const pre = finite(preBoilL ?? undefined);
  const packaged = finite(packagedL ?? undefined);
  if (pre === undefined || pre <= 0 || packaged === undefined) return { percent: null };

  const percent = (100 * packaged) / pre;
  return percent > 100
    ? {
        percent,
        warning:
          "Rendement supérieur à 100 % : le volume conditionné dépasse le volume " +
          "pré-ébullition, ce qui est physiquement impossible. Vérifier les volumes saisis.",
      }
    : { percent };
}
