/**
 * Orchestration du module `stock` (M5-03) : CRUD catalogue, lots, et décoration
 * des articles avec l'indicateur de seuil de réappro (`evaluateReorder`, M5-01).
 * Le `kind` d'un article est **immuable après création** (intégrité de la logique
 * de stock §3.3) ; la suppression n'est pas exposée (registre append-only).
 */

import { evaluateReorder } from "@brasso/core";
import type { BatchStatus } from "@brasso/db";

import type { ConsumeResult } from "./consume.js";
import type {
  CatalogItemRecord,
  InventoryLineResult,
  MovementCreatedResult,
  MovementListResult,
  PaginationInput,
  StockItemAggregate,
  StockItemListFilters,
  StockLotView,
  StockMovementView,
  StockRepository,
} from "./repository.js";
import type {
  CatalogItemInput,
  CatalogItemUpdate,
  InventoryBody,
  StockLotInput,
  StockMovementBody,
} from "./schema.js";

/** Article introuvable → 404 (lu par l'error handler global). */
export class CatalogItemNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "CATALOG_ITEM_NOT_FOUND";
  constructor(id: string) {
    super(`Article de catalogue ${id} introuvable`);
    this.name = "CatalogItemNotFoundError";
  }
}

/** Tentative de modification du `kind` (immuable après création) → 400. */
export class CatalogItemKindImmutableError extends Error {
  readonly statusCode = 400;
  readonly code = "CATALOG_ITEM_KIND_IMMUTABLE";
  constructor(id: string) {
    super(`Le type (kind) de l'article ${id} n'est pas modifiable après création`);
    this.name = "CatalogItemKindImmutableError";
  }
}

/** Batch introuvable (consommation de stock) → 404. */
export class BatchNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "BATCH_NOT_FOUND";
  constructor(id: string) {
    super(`Batch ${id} introuvable`);
    this.name = "BatchNotFoundError";
  }
}

/** Consommation refusée : le batch n'est pas encore ensemencé (`< EN_FERMENTATION`) → 409. */
export class BatchNotSeededError extends Error {
  readonly statusCode = 409;
  readonly code = "BATCH_NOT_SEEDED";
  constructor(id: string, status: string) {
    super(`Le batch ${id} (${status}) n'est pas encore ensemencé — stock non consommable`);
    this.name = "BatchNotSeededError";
  }
}

/** Statuts à partir desquels le batch est ensemencé (réservations consommables). */
const SEEDED_STATUSES: readonly BatchStatus[] = [
  "EN_FERMENTATION",
  "EN_CONDITIONNEMENT",
  "TERMINE",
];

/** Article + agrégats + indicateur de seuil (disponible net, franchissement). */
export interface StockItemView extends StockItemAggregate {
  available: number;
  below: boolean;
}

/** Détail d'un article : vue + lots + derniers mouvements. */
export interface StockItemDetailView extends StockItemView {
  lots: StockLotView[];
  recentMovements: StockMovementView[];
}

/** Ajoute `available`/`below` à un article via le seuil différencié par `kind`. */
function withReorder(item: StockItemAggregate): StockItemView {
  const { available, below } = evaluateReorder({
    kind: item.kind,
    level: item.level,
    reserved: item.reservedOutstanding,
    threshold: item.reorderThreshold,
  });
  return { ...item, available, below };
}

export class StockService {
  constructor(private readonly repo: StockRepository) {}

  async listItems(
    filters: StockItemListFilters,
  ): Promise<{ items: StockItemView[]; total: number }> {
    const { items, total } = await this.repo.listItems(filters);
    return { items: items.map(withReorder), total };
  }

  async getItem(id: string): Promise<StockItemDetailView> {
    const detail = await this.repo.findItemDetail(id);
    if (!detail) {
      throw new CatalogItemNotFoundError(id);
    }
    return {
      ...withReorder(detail.item),
      lots: detail.lots,
      recentMovements: detail.recentMovements,
    };
  }

  createItem(body: CatalogItemInput): Promise<CatalogItemRecord> {
    return this.repo.createItem(body);
  }

  async updateItem(id: string, body: CatalogItemUpdate): Promise<CatalogItemRecord> {
    const existing = await this.repo.findItemById(id);
    if (!existing) {
      throw new CatalogItemNotFoundError(id);
    }
    if (body.kind !== undefined && body.kind !== existing.kind) {
      throw new CatalogItemKindImmutableError(id);
    }
    return this.repo.updateItem(id, body);
  }

  async createLot(catalogItemId: string, body: StockLotInput): Promise<StockLotView> {
    const existing = await this.repo.findItemById(catalogItemId);
    if (!existing) {
      throw new CatalogItemNotFoundError(catalogItemId);
    }
    return this.repo.createLot(catalogItemId, body);
  }

  /** Enregistre un mouvement manuel (append-only) et renvoie le nouveau niveau. */
  async createMovement(
    body: StockMovementBody,
    userId: string | null,
  ): Promise<MovementCreatedResult> {
    const existing = await this.repo.findItemById(body.catalogItemId);
    if (!existing) {
      throw new CatalogItemNotFoundError(body.catalogItemId);
    }
    return this.repo.createMovement({ ...body, userId });
  }

  async listMovements(
    catalogItemId: string,
    pagination: PaginationInput,
  ): Promise<MovementListResult> {
    const existing = await this.repo.findItemById(catalogItemId);
    if (!existing) {
      throw new CatalogItemNotFoundError(catalogItemId);
    }
    return this.repo.listMovements(catalogItemId, pagination);
  }

  /**
   * Applique un inventaire périodique : chaque écart génère un mouvement
   * `INVENTORY` (append-only, transactionnel). Les articles inconnus → 404
   * avant toute écriture.
   */
  async applyInventory(body: InventoryBody, userId: string | null): Promise<InventoryLineResult[]> {
    for (const line of body.counts) {
      const existing = await this.repo.findItemById(line.catalogItemId);
      if (!existing) {
        throw new CatalogItemNotFoundError(line.catalogItemId);
      }
    }
    return this.repo.applyInventory(body.counts, userId);
  }

  /**
   * Déclenche/rejoue la consommation des réservations d'un batch ensemencé
   * (endpoint dédié M5-05, démo + rattrapage). Idempotent. 404 batch absent ;
   * 409 si le batch n'est pas encore en `EN_FERMENTATION` (ou au-delà).
   */
  async consumeForBatch(batchId: string, actorId: string | null): Promise<ConsumeResult> {
    const status = await this.repo.getBatchStatus(batchId);
    if (status === null) {
      throw new BatchNotFoundError(batchId);
    }
    if (!SEEDED_STATUSES.includes(status)) {
      throw new BatchNotSeededError(batchId, status);
    }
    return this.repo.consumeForBatch(batchId, actorId);
  }
}
