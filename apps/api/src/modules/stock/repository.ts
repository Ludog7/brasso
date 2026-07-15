/**
 * Accès aux données du module `stock` (M5-03) — catalogue, lots et **niveau
 * dérivé** du registre append-only `StockMovement` (« la quantité courante se
 * dérive des mouvements », schéma M1-01, §3.3). Interface injectable pour un
 * repository en mémoire dans les tests, comme les autres modules.
 *
 * Frontière avec `referentials` : ce module porte la **gestion** du stock ;
 * le picker lecture seule `GET /catalog-items` (éditeur de recettes) reste dans
 * `referentials` et n'est pas dupliqué ici.
 */

import { deriveStockLevel } from "@brasso/core";
import type {
  BatchStatus,
  CatalogKind,
  IngredientCategory,
  Prisma,
  PrismaClient,
  StockMovementReason,
  StockUnit,
} from "@brasso/db";

import type { ConsumeResult } from "./consume.js";
import { consumeReservationsForBatch, prismaConsumePort } from "./consume.js";
import type { CatalogItemInput, CatalogItemUpdate, StockLotInput } from "./schema.js";

/** Vue DB-agnostique d'un article de catalogue (champs de gestion). */
export interface CatalogItemRecord {
  id: string;
  name: string;
  kind: CatalogKind;
  category: IngredientCategory | null;
  unit: StockUnit;
  attributes: unknown;
  defaultUnitCostCents: number | null;
  reorderThreshold: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Article + agrégats de stock : niveau dérivé (`deriveStockLevel`) et réservations
 * `RESERVED` en cours. L'indicateur de seuil (`available`/`below`) est ajouté par
 * le service via `evaluateReorder` (M5-01).
 */
export interface StockItemAggregate extends CatalogItemRecord {
  level: number;
  reservedOutstanding: number;
}

/** Lot physique (aide d'inventaire ; ne crée pas de mouvement, cf. M5-04). */
export interface StockLotView {
  id: string;
  catalogItemId: string;
  lotCode: string | null;
  quantity: number;
  bestBeforeAt: Date | null;
  unitCostCents: number | null;
  createdAt: Date;
}

/** Mouvement affiché dans le détail d'un article (N plus récents). */
export interface StockMovementView {
  id: string;
  delta: number;
  reason: StockMovementReason;
  stockLotId: string | null;
  batchId: string | null;
  note: string | null;
  createdAt: Date;
}

/** Détail d'un article : agrégats + lots + derniers mouvements. */
export interface StockItemDetail {
  item: StockItemAggregate;
  lots: StockLotView[];
  recentMovements: StockMovementView[];
}

export interface StockItemListFilters {
  kind?: CatalogKind;
  category?: IngredientCategory;
  search?: string;
  limit: number;
  offset: number;
}

export interface StockItemListResult {
  items: StockItemAggregate[];
  total: number;
}

/** Insertion d'un mouvement (registre append-only) — `userId` = auteur tracé. */
export interface StockMovementInsert {
  catalogItemId: string;
  delta: number;
  reason: StockMovementReason;
  stockLotId?: string | null;
  note?: string | null;
  userId: string | null;
}

/** Mouvement inséré + nouveau niveau dérivé après insertion. */
export interface MovementCreatedResult {
  movement: StockMovementView;
  level: number;
}

/** Une ligne de comptage d'inventaire à appliquer. */
export interface InventoryCountLine {
  catalogItemId: string;
  countedQuantity: number;
  note?: string;
}

/** Résultat par ligne d'inventaire : `movementId` absent si aucun écart (no-op). */
export interface InventoryLineResult {
  catalogItemId: string;
  previousLevel: number;
  countedQuantity: number;
  delta: number;
  movementId?: string;
}

export interface PaginationInput {
  limit: number;
  offset: number;
}

export interface MovementListResult {
  movements: StockMovementView[];
  total: number;
}

export interface StockRepository {
  listItems(filters: StockItemListFilters): Promise<StockItemListResult>;
  findItemDetail(id: string): Promise<StockItemDetail | null>;
  /** Article seul (sans agrégats) — pour les gardes 404 / `kind` immuable. */
  findItemById(id: string): Promise<CatalogItemRecord | null>;
  createItem(data: CatalogItemInput): Promise<CatalogItemRecord>;
  updateItem(id: string, data: CatalogItemUpdate): Promise<CatalogItemRecord>;
  createLot(catalogItemId: string, data: StockLotInput): Promise<StockLotView>;
  /** Insère un mouvement et renvoie le nouveau niveau dérivé. */
  createMovement(input: StockMovementInsert): Promise<MovementCreatedResult>;
  /** Registre paginé d'un article (ordre `createdAt` desc). */
  listMovements(catalogItemId: string, pagination: PaginationInput): Promise<MovementListResult>;
  /** Applique un inventaire (transactionnel) : un mouvement `INVENTORY` par écart. */
  applyInventory(
    lines: InventoryCountLine[],
    userId: string | null,
  ): Promise<InventoryLineResult[]>;
  /** Statut courant d'un batch (garde 404/409 de la consommation) ; `null` si absent. */
  getBatchStatus(batchId: string): Promise<BatchStatus | null>;
  /** Consomme les réservations d'un batch à l'ensemencement (transactionnel, idempotent). */
  consumeForBatch(batchId: string, actorId: string | null): Promise<ConsumeResult>;
}

/** Nombre de mouvements récents remontés dans le détail d'un article. */
const RECENT_MOVEMENTS = 20;

const ITEM_SELECT = {
  id: true,
  name: true,
  kind: true,
  category: true,
  unit: true,
  attributes: true,
  defaultUnitCostCents: true,
  reorderThreshold: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Normalise un `attributes` validé vers l'entrée JSON Prisma (`null`/`undefined` = inchangé). */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

/** Projette un `StockMovement` Prisma vers sa vue DB-agnostique. */
function toMovementView(m: {
  id: string;
  delta: number;
  reason: StockMovementReason;
  stockLotId: string | null;
  batchId: string | null;
  note: string | null;
  createdAt: Date;
}): StockMovementView {
  return {
    id: m.id,
    delta: m.delta,
    reason: m.reason,
    stockLotId: m.stockLotId,
    batchId: m.batchId,
    note: m.note,
    createdAt: m.createdAt,
  };
}

export class PrismaStockRepository implements StockRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listItems(filters: StockItemListFilters): Promise<StockItemListResult> {
    const where: Prisma.CatalogItemWhereInput = {
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.catalogItem.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: { name: "asc" },
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.catalogItem.count({ where }),
    ]);

    const ids = items.map((item) => item.id);
    // Agrégats en 2 requêtes (pas de N+1) : somme des deltas (= `deriveStockLevel`
    // au niveau ensembliste) et somme des réservations RESERVED en cours.
    const [movementSums, reservationSums] = await this.prisma.$transaction([
      this.prisma.stockMovement.groupBy({
        by: ["catalogItemId"],
        where: { catalogItemId: { in: ids } },
        _sum: { delta: true },
        orderBy: { catalogItemId: "asc" },
      }),
      this.prisma.stockReservation.groupBy({
        by: ["catalogItemId"],
        where: { catalogItemId: { in: ids }, status: "RESERVED" },
        _sum: { quantity: true },
        orderBy: { catalogItemId: "asc" },
      }),
    ]);

    const levelById = new Map(movementSums.map((row) => [row.catalogItemId, row._sum?.delta ?? 0]));
    const reservedById = new Map(
      reservationSums.map((row) => [row.catalogItemId, row._sum?.quantity ?? 0]),
    );

    return {
      items: items.map((item) => ({
        ...item,
        level: levelById.get(item.id) ?? 0,
        reservedOutstanding: reservedById.get(item.id) ?? 0,
      })),
      total,
    };
  }

  async findItemDetail(id: string): Promise<StockItemDetail | null> {
    const item = await this.prisma.catalogItem.findUnique({ where: { id }, select: ITEM_SELECT });
    if (!item) {
      return null;
    }

    const [lots, movements, reservedAgg] = await this.prisma.$transaction([
      this.prisma.stockLot.findMany({
        where: { catalogItemId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.stockMovement.findMany({
        where: { catalogItemId: id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.stockReservation.aggregate({
        where: { catalogItemId: id, status: "RESERVED" },
        _sum: { quantity: true },
      }),
    ]);

    return {
      item: {
        ...item,
        level: deriveStockLevel(movements),
        reservedOutstanding: reservedAgg._sum.quantity ?? 0,
      },
      lots: lots.map((lot) => ({
        id: lot.id,
        catalogItemId: lot.catalogItemId,
        lotCode: lot.lotCode,
        quantity: lot.quantity,
        bestBeforeAt: lot.bestBeforeAt,
        unitCostCents: lot.unitCostCents,
        createdAt: lot.createdAt,
      })),
      recentMovements: movements.slice(0, RECENT_MOVEMENTS).map(toMovementView),
    };
  }

  findItemById(id: string): Promise<CatalogItemRecord | null> {
    return this.prisma.catalogItem.findUnique({ where: { id }, select: ITEM_SELECT });
  }

  createItem(data: CatalogItemInput): Promise<CatalogItemRecord> {
    return this.prisma.catalogItem.create({
      data: {
        name: data.name,
        kind: data.kind,
        category: data.category ?? null,
        unit: data.unit,
        attributes: toJson(data.attributes),
        defaultUnitCostCents: data.defaultUnitCostCents ?? null,
        reorderThreshold: data.reorderThreshold ?? null,
        isActive: data.isActive,
      },
      select: ITEM_SELECT,
    });
  }

  updateItem(id: string, data: CatalogItemUpdate): Promise<CatalogItemRecord> {
    return this.prisma.catalogItem.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.attributes !== undefined ? { attributes: toJson(data.attributes) } : {}),
        ...(data.defaultUnitCostCents !== undefined
          ? { defaultUnitCostCents: data.defaultUnitCostCents }
          : {}),
        ...(data.reorderThreshold !== undefined ? { reorderThreshold: data.reorderThreshold } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      select: ITEM_SELECT,
    });
  }

  async createLot(catalogItemId: string, data: StockLotInput): Promise<StockLotView> {
    const lot = await this.prisma.stockLot.create({
      data: {
        catalogItemId,
        lotCode: data.lotCode ?? null,
        quantity: data.quantity,
        bestBeforeAt: data.bestBeforeAt ?? null,
        unitCostCents: data.unitCostCents ?? null,
      },
    });
    return {
      id: lot.id,
      catalogItemId: lot.catalogItemId,
      lotCode: lot.lotCode,
      quantity: lot.quantity,
      bestBeforeAt: lot.bestBeforeAt,
      unitCostCents: lot.unitCostCents,
      createdAt: lot.createdAt,
    };
  }

  createMovement(input: StockMovementInsert): Promise<MovementCreatedResult> {
    // Insert + relecture du niveau dans la même transaction (cohérence lecture).
    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          catalogItemId: input.catalogItemId,
          delta: input.delta,
          reason: input.reason,
          stockLotId: input.stockLotId ?? null,
          note: input.note ?? null,
          userId: input.userId,
        },
      });
      const agg = await tx.stockMovement.aggregate({
        where: { catalogItemId: input.catalogItemId },
        _sum: { delta: true },
      });
      return { movement: toMovementView(movement), level: agg._sum.delta ?? 0 };
    });
  }

  async listMovements(
    catalogItemId: string,
    { limit, offset }: PaginationInput,
  ): Promise<MovementListResult> {
    const where = { catalogItemId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { movements: rows.map(toMovementView), total };
  }

  applyInventory(
    lines: InventoryCountLine[],
    userId: string | null,
  ): Promise<InventoryLineResult[]> {
    // Atomique : toutes les lignes ou aucune. Le niveau est relu ligne à ligne
    // (des lignes visant le même article se recalent séquentiellement).
    return this.prisma.$transaction(async (tx) => {
      const results: InventoryLineResult[] = [];
      for (const line of lines) {
        const agg = await tx.stockMovement.aggregate({
          where: { catalogItemId: line.catalogItemId },
          _sum: { delta: true },
        });
        const previousLevel = agg._sum.delta ?? 0;
        const delta = line.countedQuantity - previousLevel;
        let movementId: string | undefined;
        if (delta !== 0) {
          const movement = await tx.stockMovement.create({
            data: {
              catalogItemId: line.catalogItemId,
              delta,
              reason: "INVENTORY",
              note: line.note ?? null,
              userId,
            },
          });
          movementId = movement.id;
        }
        results.push({
          catalogItemId: line.catalogItemId,
          previousLevel,
          countedQuantity: line.countedQuantity,
          delta,
          ...(movementId ? { movementId } : {}),
        });
      }
      return results;
    });
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });
    return batch?.status ?? null;
  }

  consumeForBatch(batchId: string, actorId: string | null): Promise<ConsumeResult> {
    return this.prisma.$transaction((tx) =>
      consumeReservationsForBatch(prismaConsumePort(tx), batchId, actorId),
    );
  }
}
