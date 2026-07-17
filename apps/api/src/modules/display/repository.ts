/**
 * Accès aux données du module `display` (M7-08) — CRUD des `DisplaySurface` /
 * `DisplayScreen` / `DisplayScreenItem` (schéma {{M7-02}}) et **niveau de stock
 * dérivé** par produit (somme des `StockMovement.delta`, registre append-only M5)
 * pour le rendu synchronisé au stock. Interface injectable pour un repository
 * mémoire en test, comme les autres modules.
 */

import type { DisplayTemplate, PrismaClient } from "@brasso/db";

/** Surface d'affichage (Bar, Salle, Événement — nom **libre**, ADR-01). */
export interface SurfaceRecord {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Écran d'une surface : template de rendu + mentions légales (texte libre). */
export interface ScreenRecord {
  id: string;
  surfaceId: string;
  name: string;
  template: DisplayTemplate;
  legalMentions: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Produit sélectionné sur un écran + ses indicateurs (projection API). */
export interface ScreenItemRecord {
  catalogItemId: string;
  isNew: boolean;
  isFavorite: boolean;
  isSpecial: boolean;
  priceCents: number | null;
  sortOrder: number;
}

/** Données d'écriture d'une surface (nullables résolus par le service). */
export interface SurfaceWriteData {
  name: string;
  description: string | null;
  isActive: boolean;
}

/** Données d'écriture d'un écran (nullables résolus par le service). */
export interface ScreenWriteData {
  name: string;
  template: DisplayTemplate;
  legalMentions: string | null;
  isActive: boolean;
}

/**
 * Écran + surface + items **enrichis du libellé catalogue** (`name`), prêts pour
 * `selectDisplayItems` (M7-01). `stock` absent ici : dérivé à part (`stockLevelsFor`).
 */
export interface ScreenRenderData {
  screen: ScreenRecord;
  surface: { id: string; name: string };
  items: Array<ScreenItemRecord & { name: string }>;
}

/** Port d'accès au module d'affichage (Prisma en prod, mémoire en test). */
export interface DisplayRepository {
  // Surfaces
  listSurfaces(): Promise<SurfaceRecord[]>;
  findSurfaceById(id: string): Promise<SurfaceRecord | null>;
  /** Surface portant ce `name` — unicité (`DisplaySurface.name` @unique). */
  findSurfaceByName(name: string): Promise<{ id: string } | null>;
  createSurface(data: SurfaceWriteData): Promise<SurfaceRecord>;
  updateSurface(id: string, data: Partial<SurfaceWriteData>): Promise<SurfaceRecord>;
  deleteSurface(id: string): Promise<void>;

  // Écrans
  listScreens(surfaceId: string): Promise<ScreenRecord[]>;
  findScreenById(id: string): Promise<ScreenRecord | null>;
  createScreen(surfaceId: string, data: ScreenWriteData): Promise<ScreenRecord>;
  updateScreen(id: string, data: Partial<ScreenWriteData>): Promise<ScreenRecord>;
  deleteScreen(id: string): Promise<void>;

  // Produits d'un écran
  /** Sous-ensemble des `ids` **existants** en catalogue (intégrité référentielle). */
  existingCatalogItemIds(ids: string[]): Promise<Set<string>>;
  /** Remplace **atomiquement** la sélection d'un écran (deleteMany + createMany). */
  replaceScreenItems(screenId: string, items: ScreenItemRecord[]): Promise<void>;

  // Rendu
  /** Écran + surface + items (libellés catalogue joints) — `null` si écran absent. */
  getScreenRenderData(screenId: string): Promise<ScreenRenderData | null>;
  /** Niveau dérivé (somme des `delta`) par `catalogItemId` — 0 par défaut. */
  stockLevelsFor(catalogItemIds: string[]): Promise<Record<string, number>>;
}

const SURFACE_SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SCREEN_SELECT = {
  id: true,
  surfaceId: true,
  name: true,
  template: true,
  legalMentions: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Adaptateur Prisma du module d'affichage. */
export class PrismaDisplayRepository implements DisplayRepository {
  constructor(private readonly db: PrismaClient) {}

  listSurfaces(): Promise<SurfaceRecord[]> {
    return this.db.displaySurface.findMany({ orderBy: { name: "asc" }, select: SURFACE_SELECT });
  }

  findSurfaceById(id: string): Promise<SurfaceRecord | null> {
    return this.db.displaySurface.findUnique({ where: { id }, select: SURFACE_SELECT });
  }

  findSurfaceByName(name: string): Promise<{ id: string } | null> {
    return this.db.displaySurface.findUnique({ where: { name }, select: { id: true } });
  }

  createSurface(data: SurfaceWriteData): Promise<SurfaceRecord> {
    return this.db.displaySurface.create({ data, select: SURFACE_SELECT });
  }

  updateSurface(id: string, data: Partial<SurfaceWriteData>): Promise<SurfaceRecord> {
    return this.db.displaySurface.update({ where: { id }, data, select: SURFACE_SELECT });
  }

  async deleteSurface(id: string): Promise<void> {
    await this.db.displaySurface.delete({ where: { id } });
  }

  listScreens(surfaceId: string): Promise<ScreenRecord[]> {
    return this.db.displayScreen.findMany({
      where: { surfaceId },
      orderBy: { createdAt: "asc" },
      select: SCREEN_SELECT,
    });
  }

  findScreenById(id: string): Promise<ScreenRecord | null> {
    return this.db.displayScreen.findUnique({ where: { id }, select: SCREEN_SELECT });
  }

  createScreen(surfaceId: string, data: ScreenWriteData): Promise<ScreenRecord> {
    return this.db.displayScreen.create({ data: { surfaceId, ...data }, select: SCREEN_SELECT });
  }

  updateScreen(id: string, data: Partial<ScreenWriteData>): Promise<ScreenRecord> {
    return this.db.displayScreen.update({ where: { id }, data, select: SCREEN_SELECT });
  }

  async deleteScreen(id: string): Promise<void> {
    await this.db.displayScreen.delete({ where: { id } });
  }

  async existingCatalogItemIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const rows = await this.db.catalogItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async replaceScreenItems(screenId: string, items: ScreenItemRecord[]): Promise<void> {
    // Remplacement atomique : la table repart de zéro pour cet écran puis reçoit la
    // nouvelle sélection. `createMany` no-op si la liste est vide (écran vidé).
    await this.db.$transaction([
      this.db.displayScreenItem.deleteMany({ where: { screenId } }),
      this.db.displayScreenItem.createMany({
        data: items.map((item) => ({ screenId, ...item })),
      }),
    ]);
  }

  async getScreenRenderData(screenId: string): Promise<ScreenRenderData | null> {
    const screen = await this.db.displayScreen.findUnique({
      where: { id: screenId },
      select: {
        ...SCREEN_SELECT,
        surface: { select: { id: true, name: true } },
        items: {
          select: {
            catalogItemId: true,
            isNew: true,
            isFavorite: true,
            isSpecial: true,
            priceCents: true,
            sortOrder: true,
            catalogItem: { select: { name: true } },
          },
        },
      },
    });
    if (!screen) {
      return null;
    }
    const { surface, items, ...screenFields } = screen;
    return {
      screen: screenFields,
      surface: { id: surface.id, name: surface.name },
      items: items.map((item) => ({
        catalogItemId: item.catalogItemId,
        name: item.catalogItem.name,
        isNew: item.isNew,
        isFavorite: item.isFavorite,
        isSpecial: item.isSpecial,
        priceCents: item.priceCents,
        sortOrder: item.sortOrder,
      })),
    };
  }

  async stockLevelsFor(catalogItemIds: string[]): Promise<Record<string, number>> {
    if (catalogItemIds.length === 0) {
      return {};
    }
    // Niveau dérivé au niveau ensembliste : somme des `delta` par article (M5, une
    // seule requête agrégée, pas de N+1) — cohérent avec le module `stock`.
    const sums = await this.db.stockMovement.groupBy({
      by: ["catalogItemId"],
      where: { catalogItemId: { in: catalogItemIds } },
      _sum: { delta: true },
    });
    const levels: Record<string, number> = {};
    for (const row of sums) {
      levels[row.catalogItemId] = row._sum?.delta ?? 0;
    }
    return levels;
  }
}
