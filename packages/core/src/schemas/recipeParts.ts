/**
 * Sous-ressources d'une recette (M2-02, SPEC §3.1) : **ingrédients** (polymorphes
 * par catégorie) et **étapes de process** (ordonnées, `params` JSONB validé par
 * un schéma Zod par type). Schémas partagés API + front (ADR-04).
 *
 * L'ordre (`sortOrder`) n'est **pas** porté par l'entrée : les endpoints de
 * remplacement complet l'assignent depuis l'index du tableau (M2-02). Unités
 * internes (CLAUDE.md) : masse en g, volume en L, température en °C, acides alpha
 * en **fraction**.
 */

import { z } from "zod";

import type { IngredientCategory, ProcessStepType, RecipeEngine } from "./enums.js";
import {
  ingredientUseSchema,
  processStepTypeSchema,
  stabilizationMethodSchema,
  stockUnitSchema,
} from "./enums.js";

const amountG = z.number().nonnegative();
const unit = stockUnitSchema.default("GRAM");
const fraction = z.number().min(0).max(1);
const minutes = z.number().int().nonnegative();
const positiveDays = z.number().nonnegative();
/** Température en °C — peut être négative (refroidissement / chaîne du froid). */
const celsius = z.number();

// ─────────────────────────────────────────────────────────────────────────────
// Ingrédients — union discriminée par catégorie (Prisma `IngredientCategory`).
// Les spécificités de calcul (α houblon, couleur/rendement malt) vivent dans
// `params` typé par catégorie ; le front les reprojette vers les moteurs `core`.
// ─────────────────────────────────────────────────────────────────────────────

/** Params moteur d'un houblon : α **en fraction** (ex. 0.062), forme, sachet. */
export const hopParamsSchema = z.object({
  alphaFraction: fraction,
  form: z.enum(["pellet", "cryo", "leaf", "plug"]).optional(),
  bagged: z.boolean().optional(),
});

/** Params moteur d'un fermentescible empâté : couleur EBC, potentiel, empâtable. */
export const maltParamsSchema = z.object({
  colorEbc: z.number().nonnegative().optional(),
  /** Potentiel d'extrait en SG brute (ex. 1.037). */
  potentialSg: z.number().positive().optional(),
  isMashable: z.boolean().optional(),
});

const genericParams = z.record(z.unknown());

const hopIngredient = z.object({
  category: z.literal("HOP"),
  name: z.string().min(1),
  amount: amountG,
  unit,
  catalogItemId: z.string().min(1).optional(),
  // Le moment d'emploi conditionne le calcul d'IBU (M1-06) → requis pour un houblon.
  use: ingredientUseSchema,
  timeMinutes: minutes.optional(),
  params: hopParamsSchema,
});

const maltIngredient = z.object({
  category: z.literal("MALT"),
  name: z.string().min(1),
  amount: amountG,
  unit,
  catalogItemId: z.string().min(1).optional(),
  use: ingredientUseSchema.optional(),
  timeMinutes: minutes.optional(),
  params: maltParamsSchema.default({}),
});

const simpleIngredient = <T extends IngredientCategory>(category: T) =>
  z.object({
    category: z.literal(category),
    name: z.string().min(1),
    amount: amountG,
    unit,
    catalogItemId: z.string().min(1).optional(),
    use: ingredientUseSchema.optional(),
    timeMinutes: minutes.optional(),
    params: genericParams.optional(),
  });

/** Ingrédient de recette (entrée CRUD), discriminé par catégorie. */
export const recipeIngredientInputSchema = z.discriminatedUnion("category", [
  maltIngredient,
  hopIngredient,
  simpleIngredient("SUGAR"),
  simpleIngredient("YEAST"),
  simpleIngredient("ADJUNCT"),
]);
export type RecipeIngredientInput = z.infer<typeof recipeIngredientInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Étapes de process — enveloppe `{ type, name?, params }` + validation de
// `params` par un schéma Zod dédié au `type` (Prisma `ProcessStepType`).
// ─────────────────────────────────────────────────────────────────────────────

const mashParams = z.object({ tempC: celsius.optional(), timeMin: minutes.optional() });
/** Palier d'empâtage : température **et** durée requises. */
const mashStepParams = z.object({ tempC: celsius, timeMin: minutes });
const spargeParams = z.object({
  tempC: celsius.optional(),
  volumeL: z.number().nonnegative().optional(),
});
/** Ébullition : durée requise (pilote l'utilisation des houblons). */
const boilParams = z.object({ timeMin: minutes });
const whirlpoolParams = z.object({ tempC: celsius.optional(), timeMin: minutes.optional() });
const coolParams = z.object({ targetTempC: celsius.optional() });
const fermentParams = z.object({ tempC: celsius.optional(), days: positiveDays.optional() });
/** Stabilisation (ALT/SOFT) : méthode indicative + température (ADR-11). */
const stabilizeParams = z.object({
  method: stabilizationMethodSchema.optional(),
  tempC: celsius.optional(),
  notes: z.string().optional(),
});
const conditionParams = z.object({ tempC: celsius.optional(), days: positiveDays.optional() });
const packageParams = z.object({ format: z.string().min(1).optional() });

/** Schéma des `params` par type d'étape (source unique, réutilisable au front). */
export const stepParamsSchemaByType: Record<ProcessStepType, z.ZodType> = {
  MASH: mashParams,
  MASH_STEP: mashStepParams,
  SPARGE: spargeParams,
  BOIL: boilParams,
  WHIRLPOOL: whirlpoolParams,
  COOL: coolParams,
  FERMENT: fermentParams,
  STABILIZE: stabilizeParams,
  CONDITION: conditionParams,
  PACKAGE: packageParams,
  OTHER: genericParams,
};

/**
 * Étape de process (entrée CRUD). `params` est validé par le schéma dédié au
 * `type` via `superRefine` : « un schéma Zod par type » (M2-02).
 */
export const recipeStepInputSchema = z
  .object({
    type: processStepTypeSchema,
    name: z.string().min(1).optional(),
    params: z.unknown().optional(),
  })
  .superRefine((step, ctx) => {
    const result = stepParamsSchemaByType[step.type].safeParse(step.params ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ ...issue, path: ["params", ...issue.path] });
      }
    }
  });
export type RecipeStepInput = z.infer<typeof recipeStepInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Cohérence moteur — quelles catégories / types d'étape ont un sens par moteur.
// Houblons & paliers d'empâtage → BEER ; `STABILIZE` → ALT/SOFT (M2-02, ADR-06).
// ─────────────────────────────────────────────────────────────────────────────

export const ingredientCategoriesByEngine: Record<RecipeEngine, readonly IngredientCategory[]> = {
  BEER: ["MALT", "SUGAR", "HOP", "YEAST", "ADJUNCT"],
  ALT_FERMENTED: ["SUGAR", "YEAST", "ADJUNCT"],
  SOFT_DRINK: ["SUGAR", "ADJUNCT"],
};

export const stepTypesByEngine: Record<RecipeEngine, readonly ProcessStepType[]> = {
  BEER: [
    "MASH",
    "MASH_STEP",
    "SPARGE",
    "BOIL",
    "WHIRLPOOL",
    "COOL",
    "FERMENT",
    "CONDITION",
    "PACKAGE",
    "OTHER",
  ],
  ALT_FERMENTED: ["BOIL", "COOL", "FERMENT", "STABILIZE", "CONDITION", "PACKAGE", "OTHER"],
  SOFT_DRINK: ["BOIL", "COOL", "STABILIZE", "PACKAGE", "OTHER"],
};

/** L'ingrédient de cette catégorie est-il pertinent pour ce moteur ? */
export function ingredientAllowedForEngine(
  engine: RecipeEngine,
  category: IngredientCategory,
): boolean {
  return ingredientCategoriesByEngine[engine].includes(category);
}

/** Le type d'étape est-il pertinent pour ce moteur ? */
export function stepAllowedForEngine(engine: RecipeEngine, type: ProcessStepType): boolean {
  return stepTypesByEngine[engine].includes(type);
}
