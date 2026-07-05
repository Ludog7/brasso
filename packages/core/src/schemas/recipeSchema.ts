/**
 * Schéma Zod de la **recette persistée** (API/front), union discriminée par
 * `engine` — alignée sur Prisma `Recipe` + `Recipe{Beer,Alt,Soft}Details` (M1-01)
 * et sur les règles de publication des moteurs (M1-12).
 *
 * NB : distinct des types **entrée-moteur** de `./recipe.ts` (formes de calcul
 * `BeerRecipe`/`AltRecipe`/`SoftRecipe`). Ici = payload CRUD partagé. ADR-04/ADR-03.
 */

import { z } from "zod";

import {
  ingredientCategorySchema,
  ingredientUseSchema,
  recipeStatusSchema,
  stabilizationMethodSchema,
  stockUnitSchema,
  storageModeSchema,
} from "./enums.js";

/** Ingrédient d'une recette (Prisma `RecipeIngredient`, polymorphe par catégorie). */
export const recipeIngredientSchema = z.object({
  name: z.string().min(1),
  category: ingredientCategorySchema,
  use: ingredientUseSchema.optional(),
  amount: z.number().nonnegative(),
  unit: stockUnitSchema.default("GRAM"),
  /** Minute d'ajout (houblons : temps d'ébullition restant), si pertinent. */
  timeMinutes: z.number().int().nonnegative().optional(),
  catalogItemId: z.string().min(1).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  params: z.record(z.unknown()).optional(),
});

/** Cibles moteur BEER (Prisma `RecipeBeerDetails`). Densités en SG brute. */
export const beerDetailsSchema = z.object({
  styleBjcp: z.string().optional(),
  targetOg: z.number().positive().optional(),
  targetFg: z.number().positive().optional(),
  targetIbu: z.number().nonnegative().optional(),
  targetEbc: z.number().nonnegative().optional(),
  boilTimeMin: z.number().int().nonnegative().optional(),
  /** Rendement de brassage attendu (fraction 0–1, cf. Prisma). */
  efficiency: z.number().min(0).max(1).optional(),
  batchVolumeL: z.number().positive().optional(),
});

/** Détail moteur ALT_FERMENTED (Prisma `RecipeAltDetails`). */
export const altDetailsSchema = z.object({
  baseType: z.string().min(1),
  targetPh: z.number().min(0).max(14).optional(),
  /** Obligatoire pour publier (voir `recipeSchema.superRefine`). */
  stabilizationMethod: stabilizationMethodSchema.nullish(),
  residualSugarRisk: z.boolean().default(false),
  batchVolumeL: z.number().positive().optional(),
});

/** Détail moteur SOFT_DRINK (Prisma `RecipeSoftDetails`). */
export const softDetailsSchema = z.object({
  /** Concentration en sucre (g/L). */
  sugarConcentration: z.number().nonnegative().optional(),
  targetPh: z.number().min(0).max(14).optional(),
  storageMode: storageModeSchema.optional(),
  stabilizationMethod: stabilizationMethodSchema.nullish(),
  batchVolumeL: z.number().positive().optional(),
});

/** Champs communs à toutes les recettes (hors discriminant `engine`). */
const recipeCommon = {
  name: z.string().min(1),
  status: recipeStatusSchema.default("DRAFT"),
  notes: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).default([]),
};

const beerRecipeSchema = z.object({
  engine: z.literal("BEER"),
  ...recipeCommon,
  beerDetails: beerDetailsSchema,
});

const altRecipeSchema = z.object({
  engine: z.literal("ALT_FERMENTED"),
  ...recipeCommon,
  altDetails: altDetailsSchema,
});

const softRecipeSchema = z.object({
  engine: z.literal("SOFT_DRINK"),
  ...recipeCommon,
  softDetails: softDetailsSchema,
});

/**
 * Recette persistée — union discriminée par `engine`. Règle de publication
 * (ADR-06 / M1-12) : une recette **ALT_FERMENTED publiée** exige une méthode de
 * stabilisation non nulle.
 */
export const recipeSchema = z
  .discriminatedUnion("engine", [beerRecipeSchema, altRecipeSchema, softRecipeSchema])
  .superRefine((recipe, ctx) => {
    if (
      recipe.engine === "ALT_FERMENTED" &&
      recipe.status === "PUBLISHED" &&
      recipe.altDetails.stabilizationMethod == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["altDetails", "stabilizationMethod"],
        message:
          "Une recette ALT_FERMENTED publiée exige une méthode de stabilisation (ADR-06 / M1-12).",
      });
    }
  });

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
