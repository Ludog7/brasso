/**
 * Jalons datés du cycle **post-ensemencement** d'un brassin (M9-05).
 *
 * SOURCE DE VÉRITÉ : `docs/FORMULES-BRASSICOLES.md` **§13.1** — séquence,
 * conditionnalité du dry hop, suppression d'une phase de durée nulle, bornes des
 * durées et arithmétique calendaire. Aucune de ces règles n'est réinventée ici.
 *
 * Pur & déterministe (ADR-03) : la date d'ensemencement et le fuseau sont des
 * **entrées**, jamais lus d'une horloge ni de l'environnement.
 */

import type { BatchMilestoneKind } from "../schemas/enums.js";
import { addCalendarDays, calendarDateInZone } from "./calendar.js";

/** Durées prévisionnelles du cycle, en **jours entiers** (FORMULES §13.1). */
export interface CycleDurations {
  readonly fermentationDays: number;
  readonly dryHopDays: number;
  readonly coldCrashDays: number;
  /** Garde / conditioning (`Settings.defaultConditioningDays`, défaut 21 j). */
  readonly gardeDays: number;
}

/** Entrée de {@link buildBatchMilestones}. */
export interface BuildBatchMilestonesInput {
  /** Instant d'ensemencement (epoch ms) — origine de la séquence. */
  readonly pitchedAt: number;
  /** Fuseau IANA de l'instance (`Settings.timezone`, ex. `Europe/Paris`). */
  readonly timezone: string;
  readonly durations: CycleDurations;
  /**
   * La recette porte-t-elle un houblon en `use = DRY_HOP` ? Se calcule depuis le
   * `recipeSnapshot` avec {@link recipeHasDryHop}.
   */
  readonly hasDryHop: boolean;
}

/**
 * Jalon daté d'une phase du cycle. Les instants (`…At`) alimentent la
 * persistance (`BatchMilestone`, colonnes `DateTime`) ; les dates calendaires
 * (`…Date`, `YYYY-MM-DD` dans le fuseau) sont la forme sous laquelle le métier
 * et l'agenda raisonnent. Les deux sont exposées pour qu'aucun consommateur ne
 * refasse la conversion — et ne se trompe de fuseau en la refaisant.
 */
export interface BatchMilestone {
  readonly kind: BatchMilestoneKind;
  readonly plannedDurationDays: number;
  readonly plannedStartAt: number;
  readonly plannedEndAt: number;
  /** Date calendaire locale de début (`YYYY-MM-DD`). */
  readonly plannedStartDate: string;
  /** Date calendaire locale de fin (`YYYY-MM-DD`). */
  readonly plannedEndDate: string;
  /** Rang dans la séquence, **contigu** (0, 1, 2…) après suppression des phases nulles. */
  readonly sortOrder: number;
}

/**
 * Séquence canonique du cycle (FORMULES §13.1). `DRY_HOP` y figure à sa place
 * réelle ; sa présence effective est décidée à la construction.
 */
const SEQUENCE: readonly {
  readonly kind: BatchMilestoneKind;
  readonly of: keyof CycleDurations;
}[] = [
  { kind: "FERMENTATION", of: "fermentationDays" },
  { kind: "DRY_HOP", of: "dryHopDays" },
  { kind: "COLD_CRASH", of: "coldCrashDays" },
  { kind: "GARDE", of: "gardeDays" },
];

/**
 * Construit la séquence datée des jalons d'un brassin depuis son ensemencement.
 *
 * Chaque phase démarre à la fin de la précédente ; la première démarre à
 * l'ensemencement. Deux règles retirent une phase de la séquence :
 * - un **dry hop absent** de la recette (`hasDryHop === false`) ;
 * - une **durée nulle** — une phase de 0 jour ne produit pas un jalon de durée
 *   zéro, elle disparaît (FORMULES §13.1 ; conséquence à annoncer côté UI, sinon
 *   elle se lit comme un bug).
 *
 * Dans les deux cas la séquence **se referme sans trou** : la phase suivante
 * enchaîne directement sur la précédente, et `sortOrder` reste contigu.
 *
 * Les durées sont supposées valides (entiers dans `[0, 365]`) : l'appelant les
 * valide avec `buildBatchMilestonesInputSchema` (ADR-04). Cette fonction ne
 * revalide pas — elle calculerait deux fois la même règle, avec le risque de
 * diverger.
 *
 * @returns les jalons dans l'ordre chronologique ; tableau **vide** si toutes
 *   les phases retenues sont de durée nulle (rien à planifier).
 */
export function buildBatchMilestones({
  pitchedAt,
  timezone,
  durations,
  hasDryHop,
}: BuildBatchMilestonesInput): readonly BatchMilestone[] {
  const milestones: BatchMilestone[] = [];
  let cursor = pitchedAt;

  for (const { kind, of } of SEQUENCE) {
    if (kind === "DRY_HOP" && !hasDryHop) continue;
    const plannedDurationDays = durations[of];
    if (plannedDurationDays <= 0) continue;

    const plannedEndAt = addCalendarDays(cursor, plannedDurationDays, timezone);
    milestones.push({
      kind,
      plannedDurationDays,
      plannedStartAt: cursor,
      plannedEndAt,
      plannedStartDate: calendarDateInZone(cursor, timezone),
      plannedEndDate: calendarDateInZone(plannedEndAt, timezone),
      sortOrder: milestones.length,
    });
    cursor = plannedEndAt;
  }

  return milestones;
}

/**
 * La recette comporte-t-elle un **dry hop** ? Lit défensivement les ingrédients
 * du `recipeSnapshot` (JSONB opaque, ADR-06/07) : un houblon (`category = HOP`)
 * employé en `use = DRY_HOP` suffit.
 *
 * Snapshot absent, corrompu, sans ingrédients ou sans houblon ⇒ `false`, jamais
 * d'exception. Ce helper existe pour que l'UI de saisie (M9-12) n'ait pas à
 * refaire l'analyse du snapshot — et n'en produise pas une variante divergente.
 */
export function recipeHasDryHop(recipeSnapshot: unknown): boolean {
  if (typeof recipeSnapshot !== "object" || recipeSnapshot === null) return false;
  const ingredients = (recipeSnapshot as { ingredients?: unknown }).ingredients;
  if (!Array.isArray(ingredients)) return false;

  return ingredients.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const rec = entry as Record<string, unknown>;
    return rec.category === "HOP" && rec.use === "DRY_HOP";
  });
}
