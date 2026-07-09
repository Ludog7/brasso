/**
 * Schéma Zod **strict** de l'enveloppe `brasso-recipe` (v1), union discriminée par
 * `engine` (ALT_FERMENTED / SOFT_DRINK). Réutilise les schémas partagés M1-14
 * (détails moteur, ingrédients, étapes) plutôt que de redéfinir la recette : la
 * source unique de vérité reste `schemas/*`.
 *
 * Deux garde-fous par-dessus les schémas partagés :
 * - **cohérence moteur** : seules les catégories d'ingrédient et les types d'étape
 *   pertinents pour le moteur sont admis (`ingredientAllowedForEngine` /
 *   `stepAllowedForEngine`, M2-02) ;
 * - **publication** : une recette `PUBLISHED` doit satisfaire les règles de
 *   sécurité `core` (`recipePublicationCheck`, ADR-06/ADR-11) — pH + stabilisation.
 */

import { z } from "zod";

import { recipePublicationCheck } from "../engines/publication.js";
import type { IngredientCategory, ProcessStepType, RecipeEngine } from "../schemas/enums.js";
import { recipeStatusSchema } from "../schemas/enums.js";
import {
  ingredientAllowedForEngine,
  recipeStepInputSchema,
  stepAllowedForEngine,
} from "../schemas/recipeParts.js";
import {
  altDetailsSchema,
  recipeIngredientSchema,
  softDetailsSchema,
} from "../schemas/recipeSchema.js";
import { BRASSO_RECIPE_FORMAT, BRASSO_RECIPE_FORMAT_VERSION } from "./types.js";

/** Sous-ensemble d'une recette évalué par la cohérence moteur (structural). */
interface CoherenceInput {
  readonly ingredients: readonly { readonly category: IngredientCategory }[];
  readonly steps: readonly { readonly type: ProcessStepType }[];
}

/**
 * Rejette les ingrédients/étapes hors périmètre du moteur (ex. un houblon ou un
 * palier d'empâtage dans une ginger beer) — réutilise les tables M2-02.
 */
function coherenceRefine(
  engine: RecipeEngine,
): (recipe: CoherenceInput, ctx: z.RefinementCtx) => void {
  return (recipe, ctx) => {
    recipe.ingredients.forEach((ingredient, index) => {
      if (!ingredientAllowedForEngine(engine, ingredient.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ingredients", index, "category"],
          message: `Catégorie d'ingrédient ${ingredient.category} non pertinente pour le moteur ${engine}.`,
        });
      }
    });
    recipe.steps.forEach((step, index) => {
      if (!stepAllowedForEngine(engine, step.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "type"],
          message: `Type d'étape ${step.type} non pertinent pour le moteur ${engine}.`,
        });
      }
    });
  };
}

/** Champs communs d'un corps de recette d'échange (hors discriminant `engine`). */
const recipeCommon = {
  name: z.string().min(1),
  status: recipeStatusSchema.default("DRAFT"),
  notes: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).default([]),
  /** Étapes ordonnées (dont `STABILIZE`) — l'ordre est porté par l'index. */
  steps: z.array(recipeStepInputSchema).default([]),
} as const;

/** Corps de recette ALT_FERMENTED (ginger beer, hydromel…). */
export const altRecipeBodySchema = z
  .object({ ...recipeCommon, altDetails: altDetailsSchema })
  .strict()
  .superRefine(coherenceRefine("ALT_FERMENTED"));

/** Corps de recette SOFT_DRINK (limonades non fermentées). */
export const softRecipeBodySchema = z
  .object({ ...recipeCommon, softDetails: softDetailsSchema })
  .strict()
  .superRefine(coherenceRefine("SOFT_DRINK"));

const altEnvelopeSchema = z
  .object({
    format: z.literal(BRASSO_RECIPE_FORMAT),
    formatVersion: z.literal(BRASSO_RECIPE_FORMAT_VERSION),
    engine: z.literal("ALT_FERMENTED"),
    recipe: altRecipeBodySchema,
  })
  .strict();

const softEnvelopeSchema = z
  .object({
    format: z.literal(BRASSO_RECIPE_FORMAT),
    formatVersion: z.literal(BRASSO_RECIPE_FORMAT_VERSION),
    engine: z.literal("SOFT_DRINK"),
    recipe: softRecipeBodySchema,
  })
  .strict();

/** Reporte les motifs de non-publication `core` sur le nœud de détails moteur. */
function addPublicationIssues(
  errors: readonly string[],
  detailsKey: "altDetails" | "softDetails",
  ctx: z.RefinementCtx,
): void {
  for (const message of errors) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recipe", detailsKey], message });
  }
}

/**
 * Publication (ADR-06/ADR-11) : une recette `PUBLISHED` doit satisfaire les règles
 * de sécurité `core`. Réutilise `recipePublicationCheck` — source unique partagée
 * avec les moteurs et l'API — pour n'exposer **aucune** enveloppe publiée dépourvue
 * de ses paramètres de sécurité (pH + méthode de stabilisation).
 */
function publicationRefine(
  envelope: z.infer<typeof altEnvelopeSchema> | z.infer<typeof softEnvelopeSchema>,
  ctx: z.RefinementCtx,
): void {
  if (envelope.recipe.status !== "PUBLISHED") {
    return;
  }
  if (envelope.engine === "ALT_FERMENTED") {
    const details = envelope.recipe.altDetails;
    const check = recipePublicationCheck({
      engine: "ALT_FERMENTED",
      ph: details.targetPh ?? null,
      stabilizationMethod: details.stabilizationMethod ?? null,
    });
    if (!check.publishable) {
      addPublicationIssues(check.errors, "altDetails", ctx);
    }
    return;
  }
  const details = envelope.recipe.softDetails;
  const check = recipePublicationCheck({
    engine: "SOFT_DRINK",
    ph: details.targetPh ?? null,
    storageMode: details.storageMode ?? null,
    stabilizationMethod: details.stabilizationMethod ?? null,
  });
  if (!check.publishable) {
    addPublicationIssues(check.errors, "softDetails", ctx);
  }
}

/** Enveloppe `brasso-recipe` v1 complète — union discriminée + règle de publication. */
export const brassoRecipeEnvelopeSchema = z
  .discriminatedUnion("engine", [altEnvelopeSchema, softEnvelopeSchema])
  .superRefine(publicationRefine);

/** Enveloppe validée (sortie de `importRecipeJson` / `exportRecipeJson`). */
export type BrassoRecipeEnvelope = z.infer<typeof brassoRecipeEnvelopeSchema>;

/** Corps de recette ALT en **entrée** d'export (défauts optionnels). */
export type AltRecipeInput = z.input<typeof altRecipeBodySchema>;

/** Corps de recette SOFT en **entrée** d'export (défauts optionnels). */
export type SoftRecipeInput = z.input<typeof softRecipeBodySchema>;
