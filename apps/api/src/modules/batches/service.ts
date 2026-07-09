/**
 * Planification des batchs (M3-04, ADR-07). Un batch fige `recipeSnapshot` (copie
 * immuable de la recette **publiée**) + `recipeVersion` + un `batchNumber` (séquence
 * DB), statut `PLANIFIE`. Le batch ne suit **jamais** les versions ultérieures de
 * la recette. La réservation de stock est ajoutée en M3-05.
 */

import type { Prisma } from "@brasso/db";

import type { RecipeRepository, RecipeWithDetails } from "../recipes/repository.js";
import { RecipeNotFoundError, RecipeNotPublishedError } from "../recipes/service.js";
import type {
  BatchDetailView,
  BatchListFilters,
  BatchRepository,
  BatchSummaryView,
} from "./repository.js";
import type { BatchCreateBody } from "./schema.js";

/** Batch introuvable → 404. */
export class BatchNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(id: string) {
    super(`Batch ${id} introuvable`);
    this.name = "BatchNotFoundError";
  }
}

/** Annulation refusée : un batch terminé ou déjà annulé n'est pas annulable → 409. */
export class BatchNotCancelableError extends Error {
  readonly statusCode = 409;
  readonly code = "BATCH_NOT_CANCELABLE";
  constructor(id: string, status: string) {
    super(`Le batch ${id} (${status}) ne peut pas être annulé`);
    this.name = "BatchNotCancelableError";
  }
}

export class BatchService {
  constructor(
    private readonly repo: BatchRepository,
    private readonly recipes: RecipeRepository,
  ) {}

  list(filters: BatchListFilters): Promise<BatchSummaryView[]> {
    return this.repo.list(filters);
  }

  async get(id: string): Promise<BatchDetailView> {
    const batch = await this.repo.findById(id);
    if (!batch) {
      throw new BatchNotFoundError(id);
    }
    return batch;
  }

  /**
   * Planifie un batch depuis une recette **PUBLISHED** : fige version + snapshot.
   * 404 si la recette n'existe pas, 409 `RECIPE_NOT_PUBLISHED` si elle n'est pas publiée.
   */
  async plan(body: BatchCreateBody): Promise<BatchDetailView> {
    const recipe = await this.recipes.findById(body.recipeId);
    if (!recipe) {
      throw new RecipeNotFoundError(body.recipeId);
    }
    if (recipe.status !== "PUBLISHED") {
      throw new RecipeNotPublishedError(body.recipeId);
    }
    return this.repo.create({
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      recipeSnapshot: toSnapshot(recipe),
      equipmentProfileId: body.equipmentProfileId ?? null,
      plannedAt: body.plannedAt ?? null,
    });
  }

  /** Annule un batch (`→ ANNULE`). Refus si déjà `TERMINE` ou `ANNULE` (M3-05 libère le stock). */
  async cancel(id: string): Promise<BatchDetailView> {
    const batch = await this.get(id);
    if (batch.status === "TERMINE" || batch.status === "ANNULE") {
      throw new BatchNotCancelableError(id, batch.status);
    }
    return this.repo.updateStatus(id, "ANNULE");
  }
}

/** Copie figée de la recette (immuable) stockée dans `recipeSnapshot` (JSONB). */
function toSnapshot(recipe: RecipeWithDetails): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(recipe)) as Prisma.InputJsonValue;
}
