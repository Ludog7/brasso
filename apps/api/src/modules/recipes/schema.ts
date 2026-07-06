/**
 * Schémas de validation des **payloads CRUD recettes** (M2-01), composés à
 * partir des schémas de détail partagés de `@brasso/core` (ADR-04 : Zod vit dans
 * `core`, réutilisé ici). On ne réexpose pas le `recipeSchema` complet du core :
 *
 * - à la **création**, `status`/`version`/`familyId` sont imposés côté serveur
 *   (toujours `DRAFT`, version 1, nouvelle famille) et **jamais** pilotés par le
 *   client ; le corps est discriminé par `engine` ;
 * - à la **mise à jour**, `engine` est immuable — la forme dépend du moteur de la
 *   recette chargée, donc le patch est validé par moteur (voir `service.ts`).
 *
 * Ingrédients & étapes de process sont hors périmètre (M2-02).
 */

import {
  altDetailsSchema,
  beerDetailsSchema,
  recipeEngineSchema,
  recipeStatusSchema,
  softDetailsSchema,
} from "@brasso/core";
import { z } from "zod";

const nameSchema = z.string().min(1, "Le nom est requis").max(200);
const notesSchema = z.string().max(5000);

/**
 * Corps de création — union discriminée par `engine`. Les détails moteur
 * réutilisent les schémas `core`. BEER/SOFT tolèrent un détail vide (brouillon
 * initial) ; ALT_FERMENTED exige `baseType` (contrainte du schéma core).
 */
export const recipeCreateBody = z.discriminatedUnion("engine", [
  z.object({
    engine: z.literal("BEER"),
    name: nameSchema,
    notes: notesSchema.optional(),
    beerDetails: beerDetailsSchema.default({}),
  }),
  z.object({
    engine: z.literal("ALT_FERMENTED"),
    name: nameSchema,
    notes: notesSchema.optional(),
    altDetails: altDetailsSchema,
  }),
  z.object({
    engine: z.literal("SOFT_DRINK"),
    name: nameSchema,
    notes: notesSchema.optional(),
    softDetails: softDetailsSchema.default({}),
  }),
]);
export type RecipeCreateBody = z.infer<typeof recipeCreateBody>;

/** Filtres de liste (`GET /api/recipes`). */
export const recipeListQuery = z.object({
  engine: recipeEngineSchema.optional(),
  status: recipeStatusSchema.optional(),
  familyId: z.string().min(1).optional(),
});
export type RecipeListQuery = z.infer<typeof recipeListQuery>;

/** Champs communs modifiables. `notes: null` efface la note ; absent = inchangé. */
const recipeUpdateCommon = z.object({
  name: nameSchema.optional(),
  notes: notesSchema.nullable().optional(),
});

// Patch de détail : toutes les clés deviennent optionnelles (mise à jour partielle).
const beerDetailsPatch = beerDetailsSchema.partial();
const altDetailsPatch = altDetailsSchema.partial();
const softDetailsPatch = softDetailsSchema.partial();

/**
 * Corps de mise à jour par moteur (`strict` : un détail d'un autre moteur — ex.
 * `beerDetails` sur une recette ALT — est rejeté en 400). Le moteur cible est
 * déterminé par la recette chargée, jamais par le client.
 */
export const recipeUpdateBodyByEngine = {
  BEER: recipeUpdateCommon.extend({ beerDetails: beerDetailsPatch.optional() }).strict(),
  ALT_FERMENTED: recipeUpdateCommon.extend({ altDetails: altDetailsPatch.optional() }).strict(),
  SOFT_DRINK: recipeUpdateCommon.extend({ softDetails: softDetailsPatch.optional() }).strict(),
} as const;

export type BeerDetailsInput = z.infer<typeof beerDetailsSchema>;
export type AltDetailsInput = z.infer<typeof altDetailsSchema>;
export type SoftDetailsInput = z.infer<typeof softDetailsSchema>;
export type BeerDetailsPatch = z.infer<typeof beerDetailsPatch>;
export type AltDetailsPatch = z.infer<typeof altDetailsPatch>;
export type SoftDetailsPatch = z.infer<typeof softDetailsPatch>;
