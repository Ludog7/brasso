import type { RecipeIngredientInput, RecipeStepInput } from "@brasso/core";
import type {
  IngredientCategory,
  IngredientUse,
  Prisma,
  PrismaClient,
  ProcessStepType,
  RecipeEngine,
  RecipeStatus,
  StabilizationMethod,
  StockUnit,
} from "@brasso/db";

import type {
  AltDetailsInput,
  AltDetailsPatch,
  BeerDetailsInput,
  BeerDetailsPatch,
  SoftDetailsInput,
  SoftDetailsPatch,
} from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Vues de sortie — forme DB-agnostique renvoyée par le repository (le `recipeId`
// redondant des tables de détail 1-1 est retiré ; ADR-06).
// ─────────────────────────────────────────────────────────────────────────────

export interface BeerDetailsView {
  styleBjcp: string | null;
  targetOg: number | null;
  targetFg: number | null;
  targetIbu: number | null;
  targetEbc: number | null;
  boilTimeMin: number | null;
  efficiency: number | null;
  batchVolumeL: number | null;
}

export interface AltDetailsView {
  baseType: string;
  targetPh: number | null;
  stabilizationMethod: StabilizationMethod | null;
  residualSugarRisk: boolean;
  batchVolumeL: number | null;
}

export interface SoftDetailsView {
  sugarConcentration: number | null;
  targetPh: number | null;
  storageMode: string | null;
  stabilizationMethod: StabilizationMethod | null;
  batchVolumeL: number | null;
}

export interface RecipeIngredientView {
  id: string;
  catalogItemId: string | null;
  name: string;
  category: IngredientCategory;
  use: IngredientUse | null;
  amount: number;
  unit: StockUnit;
  timeMinutes: number | null;
  sortOrder: number;
  params: unknown;
}

export interface RecipeStepView {
  id: string;
  type: ProcessStepType;
  name: string | null;
  sortOrder: number;
  params: unknown;
}

/** Vue résumée (liste). */
export interface RecipeSummary {
  id: string;
  familyId: string;
  version: number;
  name: string;
  engine: RecipeEngine;
  status: RecipeStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Vue détaillée : commun + détail moteur (une seule table 1-1) + ingrédients + steps. */
export interface RecipeWithDetails extends RecipeSummary {
  beerDetails: BeerDetailsView | null;
  altDetails: AltDetailsView | null;
  softDetails: SoftDetailsView | null;
  ingredients: RecipeIngredientView[];
  steps: RecipeStepView[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrées de persistance — le service a déjà validé (Zod) et imposé les champs
// serveur (`familyId`, `version=1`, `status=DRAFT`).
// ─────────────────────────────────────────────────────────────────────────────

export interface RecipeListFilters {
  engine?: RecipeEngine;
  status?: RecipeStatus;
  familyId?: string;
}

export interface RecipeCreateData {
  familyId: string;
  name: string;
  engine: RecipeEngine;
  notes: string | null;
  beerDetails?: BeerDetailsInput;
  altDetails?: AltDetailsInput;
  softDetails?: SoftDetailsInput;
}

export interface RecipeUpdateData {
  name?: string;
  notes?: string | null;
  beerDetails?: BeerDetailsPatch;
  altDetails?: AltDetailsPatch;
  softDetails?: SoftDetailsPatch;
}

/**
 * Accès aux données recettes. Interface pour injecter une implémentation en
 * mémoire dans les tests (hermétiques, sans base) — même approche que l'auth.
 */
export interface RecipeRepository {
  list(filters: RecipeListFilters): Promise<RecipeSummary[]>;
  findById(id: string): Promise<RecipeWithDetails | null>;
  create(data: RecipeCreateData): Promise<RecipeWithDetails>;
  update(id: string, data: RecipeUpdateData): Promise<RecipeWithDetails>;
  delete(id: string): Promise<void>;
  /** Remplace la liste ordonnée des ingrédients (transactionnel). `sortOrder` = index. */
  replaceIngredients(recipeId: string, items: RecipeIngredientInput[]): Promise<RecipeWithDetails>;
  /** Remplace la liste ordonnée des étapes de process (transactionnel). `sortOrder` = index. */
  replaceSteps(recipeId: string, items: RecipeStepInput[]): Promise<RecipeWithDetails>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implémentation Prisma. L'écriture Recipe + table de détail est atomique : les
// écritures imbriquées (`create`/`update`) de Prisma s'exécutent dans une seule
// transaction (ADR-06 : 1-1 strict selon `engine`).
// ─────────────────────────────────────────────────────────────────────────────

/** Colonnes du résumé (liste) — pas de détail moteur. */
const SUMMARY_SELECT = {
  id: true,
  familyId: true,
  version: true,
  name: true,
  engine: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Détail complet : commun + détails moteur + ingrédients + steps ordonnés. */
const DETAIL_INCLUDE = {
  beerDetails: true,
  altDetails: true,
  softDetails: true,
  ingredients: { orderBy: { sortOrder: "asc" } },
  steps: { orderBy: { sortOrder: "asc" } },
} as const satisfies Prisma.RecipeInclude;

type RecipeDetailRow = Prisma.RecipeGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Retire le `recipeId` redondant d'une table de détail/sous-ressource. */
function stripRecipeId<T extends { recipeId: string }>(row: T): Omit<T, "recipeId"> {
  const { recipeId: _recipeId, ...rest } = row;
  return rest;
}

function toDetail(row: RecipeDetailRow): RecipeWithDetails {
  return {
    id: row.id,
    familyId: row.familyId,
    version: row.version,
    name: row.name,
    engine: row.engine,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    beerDetails: row.beerDetails ? stripRecipeId(row.beerDetails) : null,
    altDetails: row.altDetails ? stripRecipeId(row.altDetails) : null,
    softDetails: row.softDetails ? stripRecipeId(row.softDetails) : null,
    ingredients: row.ingredients.map(stripRecipeId),
    steps: row.steps.map(stripRecipeId),
  };
}

export class PrismaRecipeRepository implements RecipeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(filters: RecipeListFilters): Promise<RecipeSummary[]> {
    return this.prisma.recipe.findMany({
      where: {
        ...(filters.engine ? { engine: filters.engine } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.familyId ? { familyId: filters.familyId } : {}),
      },
      select: SUMMARY_SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  async findById(id: string): Promise<RecipeWithDetails | null> {
    const row = await this.prisma.recipe.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    return row ? toDetail(row) : null;
  }

  async create(data: RecipeCreateData): Promise<RecipeWithDetails> {
    const row = await this.prisma.recipe.create({
      data: {
        familyId: data.familyId,
        version: 1,
        name: data.name,
        engine: data.engine,
        status: "DRAFT",
        notes: data.notes,
        ...(data.beerDetails ? { beerDetails: { create: data.beerDetails } } : {}),
        ...(data.altDetails ? { altDetails: { create: data.altDetails } } : {}),
        ...(data.softDetails ? { softDetails: { create: data.softDetails } } : {}),
      },
      include: DETAIL_INCLUDE,
    });
    return toDetail(row);
  }

  async update(id: string, data: RecipeUpdateData): Promise<RecipeWithDetails> {
    const row = await this.prisma.recipe.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.beerDetails ? { beerDetails: { update: data.beerDetails } } : {}),
        ...(data.altDetails ? { altDetails: { update: data.altDetails } } : {}),
        ...(data.softDetails ? { softDetails: { update: data.softDetails } } : {}),
      },
      include: DETAIL_INCLUDE,
    });
    return toDetail(row);
  }

  async delete(id: string): Promise<void> {
    // Détails/ingrédients/steps sont supprimés en cascade (onDelete: Cascade).
    await this.prisma.recipe.delete({ where: { id } });
  }

  replaceIngredients(recipeId: string, items: RecipeIngredientInput[]): Promise<RecipeWithDetails> {
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { recipeId } });
      if (items.length > 0) {
        await tx.recipeIngredient.createMany({
          data: items.map((it, index) => ({
            recipeId,
            name: it.name,
            category: it.category,
            use: it.use ?? null,
            amount: it.amount,
            unit: it.unit,
            timeMinutes: it.timeMinutes ?? null,
            params: toJson(it.params),
            catalogItemId: it.catalogItemId ?? null,
            sortOrder: index,
          })),
        });
      }
      const row = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        include: DETAIL_INCLUDE,
      });
      return toDetail(row);
    });
  }

  replaceSteps(recipeId: string, items: RecipeStepInput[]): Promise<RecipeWithDetails> {
    return this.prisma.$transaction(async (tx) => {
      await tx.recipeProcessStep.deleteMany({ where: { recipeId } });
      if (items.length > 0) {
        await tx.recipeProcessStep.createMany({
          data: items.map((it, index) => ({
            recipeId,
            type: it.type,
            name: it.name ?? null,
            params: toJson(it.params),
            sortOrder: index,
          })),
        });
      }
      const row = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        include: DETAIL_INCLUDE,
      });
      return toDetail(row);
    });
  }
}

/** Normalise un `params` validé vers l'entrée JSON Prisma (`undefined` = colonne inchangée/null). */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
