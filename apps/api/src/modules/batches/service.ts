/**
 * Planification des batchs (M3-04, ADR-07) + réservation de stock (M3-05). Un batch
 * fige `recipeSnapshot` (copie immuable de la recette **publiée**) + `recipeVersion`
 * + un `batchNumber`, statut `PLANIFIE`, et **réserve** le stock des ingrédients
 * catalogués. Le batch ne suit jamais les versions ultérieures de la recette.
 */

import type { BatchStatus } from "@brasso/core";
import type { Prisma } from "@brasso/db";

import type {
  RecipeIngredientView,
  RecipeRepository,
  RecipeWithDetails,
} from "../recipes/repository.js";
import { RecipeNotFoundError, RecipeNotPublishedError } from "../recipes/service.js";
import type {
  BatchDetailView,
  BatchListFilters,
  BatchRepository,
  BatchSummaryView,
  MeasureCreateData,
  MeasureView,
  ReservationInput,
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

/** Transition de statut non autorisée (progression administrative M3-06) → 409. */
export class InvalidTransitionError extends Error {
  readonly statusCode = 409;
  readonly code = "INVALID_TRANSITION";
  constructor(id: string, from: string, to: string) {
    super(`Transition ${from} → ${to} interdite pour le batch ${id}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * Progression **administrative** linéaire d'un batch (hors state machine Jour J,
 * ADR-08 / M4). Chaque cran horodate son jalon (voir `milestonePatch`, repo).
 */
const LINEAR_FLOW: readonly BatchStatus[] = [
  "PLANIFIE",
  "EN_BRASSAGE",
  "EN_FERMENTATION",
  "EN_CONDITIONNEMENT",
  "TERMINE",
];

/**
 * Une transition est légale si elle avance d'exactement un cran dans le flux
 * linéaire, ou passe à `ANNULE` depuis n'importe quel statut sauf terminal
 * (`TERMINE`/`ANNULE`). Tout le reste (saut, retour arrière, no-op) est refusé.
 */
function isTransitionAllowed(from: BatchStatus, to: BatchStatus): boolean {
  if (to === "ANNULE") {
    return from !== "TERMINE" && from !== "ANNULE";
  }
  const index = LINEAR_FLOW.indexOf(from);
  return index >= 0 && LINEAR_FLOW[index + 1] === to;
}

/** Avertissement de stock insuffisant (indicatif, non bloquant en M3). */
export interface StockWarning {
  catalogItemId: string;
  name: string;
  requested: number;
  available: number;
}

/** Résultat de planification : le batch + le bilan de réservation. */
export interface BatchPlanResult {
  batch: BatchDetailView;
  /** Ingrédients hors catalogue (saisis à la main) → non réservés. */
  unreservedIngredients: string[];
  /** Articles dont le stock disponible est inférieur au besoin (non bloquant). */
  stockWarnings: StockWarning[];
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
   * Planifie un batch depuis une recette **PUBLISHED** : fige version + snapshot et
   * réserve le stock des ingrédients catalogués. 404 si la recette n'existe pas,
   * 409 `RECIPE_NOT_PUBLISHED` sinon. Stock insuffisant → avertissement (non bloquant).
   */
  async plan(body: BatchCreateBody, createdById: string | null): Promise<BatchPlanResult> {
    const recipe = await this.recipes.findById(body.recipeId);
    if (!recipe) {
      throw new RecipeNotFoundError(body.recipeId);
    }
    if (recipe.status !== "PUBLISHED") {
      throw new RecipeNotPublishedError(body.recipeId);
    }

    const { reservations, unreservedIngredients } = resolveReservations(recipe.ingredients);
    const available = await this.repo.availableByItem(reservations.map((r) => r.catalogItemId));
    const stockWarnings = reservations
      .filter((r) => (available.get(r.catalogItemId) ?? 0) < r.quantity)
      .map((r) => ({
        catalogItemId: r.catalogItemId,
        name: r.name,
        requested: r.quantity,
        available: available.get(r.catalogItemId) ?? 0,
      }));

    const batch = await this.repo.create(
      {
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        recipeSnapshot: toSnapshot(recipe),
        equipmentProfileId: body.equipmentProfileId ?? null,
        plannedAt: body.plannedAt ?? null,
      },
      reservations.map((r) => ({ catalogItemId: r.catalogItemId, quantity: r.quantity })),
      createdById,
    );

    return { batch, unreservedIngredients, stockWarnings };
  }

  /** Annule un batch (`→ ANNULE`) et libère ses réservations. Refus si `TERMINE`/`ANNULE`. */
  async cancel(id: string): Promise<BatchDetailView> {
    const batch = await this.get(id);
    if (batch.status === "TERMINE" || batch.status === "ANNULE") {
      throw new BatchNotCancelableError(id, batch.status);
    }
    return this.repo.cancel(id);
  }

  /**
   * Fait progresser le statut d'un batch (progression administrative M3-06, hors
   * Jour J). Transition illégale → 409 `INVALID_TRANSITION`. Passer à `ANNULE`
   * libère les réservations (même effet que `cancel`).
   */
  async changeStatus(
    id: string,
    target: BatchStatus,
    actorId: string | null = null,
  ): Promise<BatchDetailView> {
    const batch = await this.get(id);
    if (!isTransitionAllowed(batch.status, target)) {
      throw new InvalidTransitionError(id, batch.status, target);
    }
    if (target === "ANNULE") {
      return this.repo.cancel(id);
    }
    return this.repo.transition(id, target, actorId);
  }

  /** Enregistre une mesure append-only sur un batch existant (404 sinon). */
  async addMeasure(
    id: string,
    data: MeasureCreateData,
    loggedById: string | null,
  ): Promise<MeasureView> {
    await this.get(id);
    return this.repo.addMeasure(id, data, loggedById);
  }

  /** Relit les mesures d'un batch existant (chronologiques), filtrables par type. */
  async listMeasures(id: string, type?: MeasureCreateData["type"]): Promise<MeasureView[]> {
    await this.get(id);
    return this.repo.listMeasures(id, type);
  }
}

/** Réservation enrichie du nom d'ingrédient (pour les avertissements). */
interface NamedReservation extends ReservationInput {
  name: string;
}

/**
 * Agrège les ingrédients du snapshot par article de catalogue (une réservation par
 * article) ; les ingrédients sans `catalogItemId` (saisis à la main) sont listés à
 * part, non réservés.
 */
function resolveReservations(ingredients: readonly RecipeIngredientView[]): {
  reservations: NamedReservation[];
  unreservedIngredients: string[];
} {
  const byItem = new Map<string, NamedReservation>();
  const unreservedIngredients: string[] = [];
  for (const ing of ingredients) {
    if (ing.catalogItemId == null) {
      unreservedIngredients.push(ing.name);
      continue;
    }
    const current = byItem.get(ing.catalogItemId);
    if (current) {
      current.quantity += ing.amount;
    } else {
      byItem.set(ing.catalogItemId, {
        catalogItemId: ing.catalogItemId,
        quantity: ing.amount,
        name: ing.name,
      });
    }
  }
  return { reservations: [...byItem.values()], unreservedIngredients };
}

/** Copie figée de la recette (immuable) stockée dans `recipeSnapshot` (JSONB). */
function toSnapshot(recipe: RecipeWithDetails): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(recipe)) as Prisma.InputJsonValue;
}
