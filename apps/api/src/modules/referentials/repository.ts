import type { CatalogKind, IngredientCategory, PrismaClient, StockUnit } from "@brasso/db";

/**
 * Vue lecture d'un article de catalogue pour les pickers de l'éditeur. Les
 * champs techniques (couleur EBC, α en fraction, rendements) vivent dans
 * `attributes` (JSONB), déjà exprimés en unités internes par le seed (M1-02).
 */
export interface CatalogItemView {
  id: string;
  name: string;
  kind: CatalogKind;
  category: IngredientCategory | null;
  unit: StockUnit;
  attributes: unknown;
  defaultUnitCostCents: number | null;
  reorderThreshold: number | null;
}

export interface CatalogListFilters {
  kind?: CatalogKind;
  category?: IngredientCategory;
  search?: string;
  limit: number;
  offset: number;
}

export interface CatalogListResult {
  items: CatalogItemView[];
  /** Total (hors pagination) — pour le compte côté client. */
  total: number;
}

/**
 * Accès lecture au catalogue (`CatalogItem`). Interface pour injecter une
 * implémentation en mémoire dans les tests — même approche que les autres modules.
 */
export interface CatalogRepository {
  list(filters: CatalogListFilters): Promise<CatalogListResult>;
}

const CATALOG_SELECT = {
  id: true,
  name: true,
  kind: true,
  category: true,
  unit: true,
  attributes: true,
  defaultUnitCostCents: true,
  reorderThreshold: true,
} as const;

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filters: CatalogListFilters): Promise<CatalogListResult> {
    const where = {
      isActive: true,
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.catalogItem.findMany({
        where,
        select: CATALOG_SELECT,
        orderBy: { name: "asc" },
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.catalogItem.count({ where }),
    ]);
    return { items, total };
  }
}
