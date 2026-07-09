/**
 * Export d'une recette ALT_FERMENTED / SOFT_DRINK vers l'enveloppe `brasso-recipe`
 * v1. Le contenu est **revalidé** par le schéma strict avant émission : aucune
 * enveloppe publiée ne sort sans ses paramètres de sécurité (ADR-06/ADR-11), et
 * les défauts (statut, tableaux vides) sont normalisés → aller-retour identité
 * avec {@link importRecipeJson}.
 */

import {
  type AltRecipeInput,
  type BrassoRecipeEnvelope,
  brassoRecipeEnvelopeSchema,
  type SoftRecipeInput,
} from "./schema.js";
import {
  BRASSO_RECIPE_FORMAT,
  BRASSO_RECIPE_FORMAT_VERSION,
  BrassoRecipeValidationError,
} from "./types.js";

/** Contenu exportable — discriminé par moteur (BEER exclu : passe par BeerXML). */
export type BrassoRecipeContent =
  | { readonly engine: "ALT_FERMENTED"; readonly recipe: AltRecipeInput }
  | { readonly engine: "SOFT_DRINK"; readonly recipe: SoftRecipeInput };

/**
 * Construit l'enveloppe `brasso-recipe` v1 d'une recette ALT/SOFT. Lève
 * {@link BrassoRecipeValidationError} si le contenu viole le schéma strict
 * (notamment une recette publiée sans paramètres de sécurité).
 */
export function exportRecipeJson(content: BrassoRecipeContent): BrassoRecipeEnvelope {
  const result = brassoRecipeEnvelopeSchema.safeParse({
    format: BRASSO_RECIPE_FORMAT,
    formatVersion: BRASSO_RECIPE_FORMAT_VERSION,
    engine: content.engine,
    recipe: content.recipe,
  });
  if (!result.success) {
    throw new BrassoRecipeValidationError(result.error.issues);
  }
  return result.data;
}
