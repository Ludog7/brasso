/**
 * Schémas Zod du **cycle post-ensemencement** d'un brassin (M9-05, ADR-04) —
 * entrée du calcul des jalons datés (`buildBatchMilestones`, FORMULES §13.1).
 *
 * Unités internes (CLAUDE.md) : durées en **jours entiers**, instants en epoch ms.
 * Les durées par défaut vivent en `Settings` (M9-02) et sont **fournies en
 * entrée** — `core` n'en code aucune (ADR-01).
 */

import { z } from "zod";

/**
 * Borne haute d'une durée de phase, en jours (FORMULES Annexe B). Au-delà, on
 * refuse plutôt que d'écrêter en silence : une saisie de 400 jours est une
 * faute de frappe, pas une intention.
 */
export const MAX_CYCLE_DURATION_DAYS = 365;
/** Borne basse : `0` **supprime** la phase de la séquence (FORMULES §13.1). */
export const MIN_CYCLE_DURATION_DAYS = 0;

/**
 * Durée d'une phase du cycle : entier de jours dans `[0, 365]`. Hors bornes ⇒
 * erreur de validation explicite, jamais un écrêtage silencieux (FORMULES §13.1).
 */
export const cycleDurationDaysSchema = z
  .number()
  .int()
  .min(MIN_CYCLE_DURATION_DAYS)
  .max(MAX_CYCLE_DURATION_DAYS);

/**
 * Durées prévisionnelles saisies à la validation de l'ensemencement. Aucune
 * valeur par défaut ici : l'appelant les lit des `Settings` (M9-02) et peut les
 * ajuster par brassin.
 */
export const cycleDurationsSchema = z.object({
  fermentationDays: cycleDurationDaysSchema,
  dryHopDays: cycleDurationDaysSchema,
  coldCrashDays: cycleDurationDaysSchema,
  /** Garde / conditioning (`Settings.defaultConditioningDays`, défaut 21 j). */
  gardeDays: cycleDurationDaysSchema,
});

/** Entrée du calcul des jalons datés (miroir de `BuildBatchMilestonesInput`). */
export const buildBatchMilestonesInputSchema = z.object({
  /** Instant d'ensemencement (epoch ms) — **entrée**, jamais lu d'une horloge (ADR-03). */
  pitchedAt: z.number().int().nonnegative(),
  /**
   * Fuseau de l'instance au sens IANA (`Settings.timezone`, défaut
   * `Europe/Paris`). Fourni par l'appelant : `core` ne lit pas le fuseau système.
   */
  timezone: z.string().min(1),
  durations: cycleDurationsSchema,
  /**
   * La recette porte-t-elle un houblon en `use = DRY_HOP` ? Se calcule avec
   * `recipeHasDryHop` depuis le `recipeSnapshot`.
   */
  hasDryHop: z.boolean(),
});

export type CycleDurationsInput = z.infer<typeof cycleDurationsSchema>;
export type BuildBatchMilestonesInputParsed = z.infer<typeof buildBatchMilestonesInputSchema>;
