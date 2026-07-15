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
  CatalogKind,
  IngredientCategory,
  Prisma,
  PrismaClient,
  StockMovementReason,
  StockUnit,
} from "@brasso/db";

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

export interface StockRepository {
  listItems(filters: StockItemListFilters): Promise<StockItemListResult>;
  findItemDetail(id: string): Promise<StockItemDetail | null>;
  /** Article seul (sans agrégats) — pour les gardes 404 / `kind` immuable. */
  findItemById(id: string): Promise<CatalogItemRecord | null>;
  createItem(data: CatalogItemInput): Promise<CatalogItemRecord>;
  updateItem(id: string, data: CatalogItemUpdate): Promise<CatalogItemRecord>;
  createLot(catalogItemId: string, data: StockLotInput): Promise<StockLotView>;
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
      recentMovements: movements.slice(0, RECENT_MOVEMENTS).map((m) => ({
        id: m.id,
        delta: m.delta,
        reason: m.reason,
        stockLotId: m.stockLotId,
        batchId: m.batchId,
        note: m.note,
        createdAt: m.createdAt,
      })),
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
}
