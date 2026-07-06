import { randomUUID } from "node:crypto";

import type {
  RecipeCreateData,
  RecipeListFilters,
  RecipeRepository,
  RecipeSummary,
  RecipeUpdateData,
  RecipeWithDetails,
} from "./repository.js";
import type { RecipeCreateBody } from "./schema.js";
import { recipeUpdateBodyByEngine } from "./schema.js";

/**
 * Recette introuvable → 404. Le `statusCode`/`code` sont lus par l'error handler
 * global (`plugins/errorHandler.ts`), qui produit la réponse normalisée.
 */
export class RecipeNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(id: string) {
    super(`Recette ${id} introuvable`);
    this.name = "RecipeNotFoundError";
  }
}

/**
 * Écriture refusée : une recette non `DRAFT` est immuable (ADR-06). PATCH/DELETE
 * sur `PUBLISHED`/`ARCHIVED` → 409.
 */
export class RecipeNotDraftError extends Error {
  readonly statusCode = 409;
  readonly code = "RECIPE_NOT_DRAFT";
  constructor(id: string) {
    super(`La recette ${id} n'est pas un brouillon (DRAFT) : modification/suppression refusée`);
    this.name = "RecipeNotDraftError";
  }
}

/**
 * Orchestration métier du CRUD recettes (M2-01). Impose les invariants serveur :
 * création toujours en `DRAFT` version 1 avec une nouvelle `familyId` ; PATCH/
 * DELETE réservés aux brouillons. La validation Zod du corps a lieu ici pour la
 * mise à jour, car sa forme dépend du moteur de la recette chargée.
 */
export class RecipeService {
  constructor(private readonly repo: RecipeRepository) {}

  list(filters: RecipeListFilters): Promise<RecipeSummary[]> {
    return this.repo.list(filters);
  }

  async get(id: string): Promise<RecipeWithDetails> {
    const recipe = await this.repo.findById(id);
    if (!recipe) {
      throw new RecipeNotFoundError(id);
    }
    return recipe;
  }

  create(body: RecipeCreateBody): Promise<RecipeWithDetails> {
    const data: RecipeCreateData = {
      familyId: randomUUID(),
      name: body.name,
      engine: body.engine,
      notes: body.notes ?? null,
      ...(body.engine === "BEER" ? { beerDetails: body.beerDetails } : {}),
      ...(body.engine === "ALT_FERMENTED" ? { altDetails: body.altDetails } : {}),
      ...(body.engine === "SOFT_DRINK" ? { softDetails: body.softDetails } : {}),
    };
    return this.repo.create(data);
  }

  async update(id: string, rawBody: unknown): Promise<RecipeWithDetails> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new RecipeNotFoundError(id);
    }
    if (existing.status !== "DRAFT") {
      throw new RecipeNotDraftError(id);
    }
    // La forme du patch dépend du moteur : `.strict()` rejette un détail d'un
    // autre moteur (ZodError → 400 via l'error handler).
    const data: RecipeUpdateData = recipeUpdateBodyByEngine[existing.engine].parse(rawBody);
    return this.repo.update(id, data);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new RecipeNotFoundError(id);
    }
    if (existing.status !== "DRAFT") {
      throw new RecipeNotDraftError(id);
    }
    await this.repo.delete(id);
  }
}
