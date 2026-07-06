import { randomUUID } from "node:crypto";

import type { RecipeEngine, RecipePublicationInput } from "@brasso/core";
import {
  ingredientAllowedForEngine,
  recipePublicationCheck,
  stepAllowedForEngine,
} from "@brasso/core";

import type {
  RecipeCreateData,
  RecipeListFilters,
  RecipeRepository,
  RecipeSummary,
  RecipeUpdateData,
  RecipeWithDetails,
} from "./repository.js";
import type { RecipeCreateBody } from "./schema.js";
import { recipeUpdateBodyByEngine, replaceIngredientsBody, replaceStepsBody } from "./schema.js";

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
 * Sous-ressource incohérente avec le moteur de la recette (M2-02, ADR-06) : ex.
 * un houblon ou un palier d'empâtage sur une recette non-BEER → 400.
 */
export class RecipeEngineMismatchError extends Error {
  readonly statusCode = 400;
  readonly code = "ENGINE_MISMATCH";
  constructor(engine: RecipeEngine, detail: string) {
    super(`Élément incompatible avec le moteur ${engine} : ${detail}`);
    this.name = "RecipeEngineMismatchError";
  }
}

/** Transition invalide : action réservée à une recette `PUBLISHED` (ADR-07) → 409. */
export class RecipeNotPublishedError extends Error {
  readonly statusCode = 409;
  readonly code = "RECIPE_NOT_PUBLISHED";
  constructor(id: string) {
    super(`La recette ${id} n'est pas publiée : action réservée à une recette PUBLISHED`);
    this.name = "RecipeNotPublishedError";
  }
}

/** Un brouillon existe déjà dans la famille : nouvelle version refusée (ADR-07) → 409. */
export class DraftAlreadyExistsError extends Error {
  readonly statusCode = 409;
  readonly code = "DRAFT_ALREADY_EXISTS";
  constructor(familyId: string) {
    super(`Un brouillon (DRAFT) existe déjà dans la famille ${familyId} : éditez-le`);
    this.name = "DraftAlreadyExistsError";
  }
}

/**
 * Publication refusée par les règles `core` (ADR-06) → 422. Les manquements sont
 * exposés dans `details.errors` (repris par l'error handler pour les statuts < 500).
 */
export class RecipeNotPublishableError extends Error {
  readonly statusCode = 422;
  readonly code = "NOT_PUBLISHABLE";
  readonly details: { errors: readonly string[] };
  constructor(errors: readonly string[]) {
    super("Recette non publiable en l'état (règles core)");
    this.name = "RecipeNotPublishableError";
    this.details = { errors };
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

  private async requireDraft(id: string): Promise<RecipeWithDetails> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new RecipeNotFoundError(id);
    }
    if (existing.status !== "DRAFT") {
      throw new RecipeNotDraftError(id);
    }
    return existing;
  }

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
    const existing = await this.requireDraft(id);
    // La forme du patch dépend du moteur : `.strict()` rejette un détail d'un
    // autre moteur (ZodError → 400 via l'error handler).
    const data: RecipeUpdateData = recipeUpdateBodyByEngine[existing.engine].parse(rawBody);
    return this.repo.update(id, data);
  }

  async remove(id: string): Promise<void> {
    await this.requireDraft(id);
    await this.repo.delete(id);
  }

  /**
   * Remplace intégralement la liste ordonnée des ingrédients d'un brouillon.
   * Rejette (400) toute catégorie incohérente avec le moteur (houblon hors BEER…).
   */
  async replaceIngredients(id: string, rawBody: unknown): Promise<RecipeWithDetails> {
    const existing = await this.requireDraft(id);
    const { ingredients } = replaceIngredientsBody.parse(rawBody);
    const offending = ingredients.find(
      (item) => !ingredientAllowedForEngine(existing.engine, item.category),
    );
    if (offending) {
      throw new RecipeEngineMismatchError(existing.engine, `catégorie ${offending.category}`);
    }
    return this.repo.replaceIngredients(id, ingredients);
  }

  /**
   * Remplace intégralement les étapes de process ordonnées d'un brouillon.
   * Rejette (400) tout type d'étape incohérent avec le moteur (palier hors BEER,
   * `STABILIZE` sur BEER…).
   */
  async replaceSteps(id: string, rawBody: unknown): Promise<RecipeWithDetails> {
    const existing = await this.requireDraft(id);
    const { steps } = replaceStepsBody.parse(rawBody);
    const offending = steps.find((item) => !stepAllowedForEngine(existing.engine, item.type));
    if (offending) {
      throw new RecipeEngineMismatchError(existing.engine, `étape ${offending.type}`);
    }
    return this.repo.replaceSteps(id, steps);
  }

  /**
   * Publie un brouillon (`DRAFT → PUBLISHED`) après validation des règles `core`
   * (ADR-06). Échec des règles → 422 avec la liste des manquements.
   */
  async publish(id: string): Promise<RecipeWithDetails> {
    const existing = await this.requireDraft(id);
    const check = recipePublicationCheck(publicationInput(existing));
    if (!check.publishable) {
      throw new RecipeNotPublishableError(check.errors);
    }
    return this.repo.updateStatus(id, "PUBLISHED");
  }

  /**
   * Crée une nouvelle version depuis une recette `PUBLISHED` : copie profonde en
   * `DRAFT` version n+1 dans la même famille. Refus (409) si la source n'est pas
   * publiée ou si un brouillon existe déjà dans la famille (unicité, ADR-07).
   */
  async createNewVersion(id: string): Promise<RecipeWithDetails> {
    const source = await this.repo.findById(id);
    if (!source) {
      throw new RecipeNotFoundError(id);
    }
    if (source.status !== "PUBLISHED") {
      throw new RecipeNotPublishedError(id);
    }
    const existingDraft = await this.repo.findDraftInFamily(source.familyId);
    if (existingDraft) {
      throw new DraftAlreadyExistsError(source.familyId);
    }
    return this.repo.createNextVersion(id);
  }

  /** Archive une recette publiée (`PUBLISHED → ARCHIVED`, ADR-07). */
  async archive(id: string): Promise<RecipeWithDetails> {
    const source = await this.repo.findById(id);
    if (!source) {
      throw new RecipeNotFoundError(id);
    }
    if (source.status !== "PUBLISHED") {
      throw new RecipeNotPublishedError(id);
    }
    return this.repo.updateStatus(id, "ARCHIVED");
  }
}

/** Projette une recette persistée vers les seuls champs pertinents pour la publication. */
function publicationInput(recipe: RecipeWithDetails): RecipePublicationInput {
  switch (recipe.engine) {
    case "ALT_FERMENTED":
      return {
        engine: "ALT_FERMENTED",
        ph: recipe.altDetails?.targetPh ?? null,
        stabilizationMethod: recipe.altDetails?.stabilizationMethod ?? null,
      };
    case "SOFT_DRINK":
      return {
        engine: "SOFT_DRINK",
        ph: recipe.softDetails?.targetPh ?? null,
        storageMode: (recipe.softDetails?.storageMode as "cold" | "ambient" | null) ?? null,
        stabilizationMethod: recipe.softDetails?.stabilizationMethod ?? null,
      };
    case "BEER":
      return { engine: "BEER" };
  }
}
