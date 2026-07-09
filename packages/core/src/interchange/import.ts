/**
 * Import d'une enveloppe `brasso-recipe` v1. Deux rejets **typés** précèdent la
 * validation Zod, pour un diagnostic API clair (M2-12) :
 * 1. `formatVersion` inconnu → {@link BrassoRecipeVersionError} ;
 * 2. moteur BEER → {@link BrassoRecipeEngineError} (redirige vers BeerXML).
 * Tout autre défaut de forme → {@link BrassoRecipeValidationError}.
 */

import { type BrassoRecipeEnvelope, brassoRecipeEnvelopeSchema } from "./schema.js";
import {
  BRASSO_RECIPE_FORMAT_VERSION,
  BrassoRecipeEngineError,
  BrassoRecipeValidationError,
  BrassoRecipeVersionError,
} from "./types.js";

/**
 * Valide et normalise un document `brasso-recipe` (objet déjà désérialisé). Lève
 * une erreur typée du module selon le motif de rejet.
 */
export function importRecipeJson(data: unknown): BrassoRecipeEnvelope {
  const header: Record<string, unknown> =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};

  // 1. Version — un `formatVersion` présent mais non supporté prime (message dédié).
  if ("formatVersion" in header && header.formatVersion !== BRASSO_RECIPE_FORMAT_VERSION) {
    throw new BrassoRecipeVersionError(header.formatVersion);
  }
  // 2. Moteur — BEER est explicitement redirigé vers BeerXML (M2-10).
  if (header.engine === "BEER") {
    throw new BrassoRecipeEngineError("BEER");
  }
  // 3. Validation stricte du reste de l'enveloppe.
  const result = brassoRecipeEnvelopeSchema.safeParse(data);
  if (!result.success) {
    throw new BrassoRecipeValidationError(result.error.issues);
  }
  return result.data;
}
