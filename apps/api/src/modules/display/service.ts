/**
 * Orchestration du module `display` (M7-08) — configuration des surfaces / écrans /
 * produits affichés et **rendu synchronisé au stock**. Garde-fous : unicité du nom
 * de surface (**409**), intégrité écran↔surface et produit↔catalogue (**404**). Le
 * rendu délègue la sélection au helper **pur** `selectDisplayItems` (M7-01) : ne
 * sont exposés que les produits disponibles (stock > 0), triés, flags résolus. Un
 * **jeton de synchro** (hash du rendu) permet au front de détecter un changement
 * significatif (base de la vue temps réel {{M7-13}}).
 */

import { createHash } from "node:crypto";

import { type RenderedDisplayItem, selectDisplayItems } from "@brasso/core";

import type {
  DisplayRepository,
  ScreenItemRecord,
  ScreenRecord,
  SurfaceRecord,
} from "./repository.js";
import type {
  ScreenCreateBody,
  ScreenItemsBody,
  ScreenUpdateBody,
  SurfaceCreateBody,
  SurfaceUpdateBody,
} from "./schema.js";

/** Surface introuvable → 404. */
export class SurfaceNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "DISPLAY_SURFACE_NOT_FOUND";
  constructor(id: string) {
    super(`Surface d'affichage ${id} introuvable`);
    this.name = "SurfaceNotFoundError";
  }
}

/** Écran introuvable → 404. */
export class ScreenNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "DISPLAY_SCREEN_NOT_FOUND";
  constructor(id: string) {
    super(`Écran d'affichage ${id} introuvable`);
    this.name = "ScreenNotFoundError";
  }
}

/** Nom de surface déjà pris → 409 (`DisplaySurface.name` @unique). */
export class SurfaceConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "DISPLAY_SURFACE_CONFLICT";
  constructor(name: string) {
    super(`Une surface nommée « ${name} » existe déjà`);
    this.name = "SurfaceConflictError";
  }
}

/** Un produit sélectionné n'existe pas au catalogue → 404 (intégrité référentielle). */
export class DisplayCatalogItemNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "CATALOG_ITEM_NOT_FOUND";
  constructor(readonly missing: string[]) {
    super(`Article(s) de catalogue introuvable(s) : ${missing.join(", ")}`);
    this.name = "DisplayCatalogItemNotFoundError";
  }
}

/** Rendu d'un écran : projection affichable + métadonnées de synchro. */
export interface ScreenRender {
  screen: {
    id: string;
    name: string;
    template: ScreenRecord["template"];
    legalMentions: string | null;
    surface: { id: string; name: string };
  };
  items: RenderedDisplayItem[];
  /** Horodatage du calcul (injecté, testable). */
  syncedAt: Date;
  /** Empreinte du rendu affiché : change à tout changement significatif (M7-13). */
  syncToken: string;
}

export class DisplayService {
  constructor(private readonly repo: DisplayRepository) {}

  // ── Surfaces ────────────────────────────────────────────────────────────

  listSurfaces(): Promise<SurfaceRecord[]> {
    return this.repo.listSurfaces();
  }

  /** Crée une surface — 409 si le nom est déjà pris. */
  async createSurface(body: SurfaceCreateBody): Promise<SurfaceRecord> {
    await this.assertSurfaceNameFree(body.name, null);
    return this.repo.createSurface({
      name: body.name,
      description: body.description ?? null,
      isActive: body.isActive,
    });
  }

  /** Met à jour une surface (partiel) — 404 si absente, 409 si le nom entre en conflit. */
  async updateSurface(id: string, body: SurfaceUpdateBody): Promise<SurfaceRecord> {
    const existing = await this.repo.findSurfaceById(id);
    if (!existing) {
      throw new SurfaceNotFoundError(id);
    }
    if (body.name !== undefined && body.name !== existing.name) {
      await this.assertSurfaceNameFree(body.name, id);
    }
    const data: Partial<{ name: string; description: string | null; isActive: boolean }> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    return this.repo.updateSurface(id, data);
  }

  /** Supprime une surface (cascade sur ses écrans/produits en schéma) — 404 si absente. */
  async deleteSurface(id: string): Promise<void> {
    if (!(await this.repo.findSurfaceById(id))) {
      throw new SurfaceNotFoundError(id);
    }
    await this.repo.deleteSurface(id);
  }

  // ── Écrans ──────────────────────────────────────────────────────────────

  /** Liste les écrans d'une surface — 404 si la surface est absente. */
  async listScreens(surfaceId: string): Promise<ScreenRecord[]> {
    if (!(await this.repo.findSurfaceById(surfaceId))) {
      throw new SurfaceNotFoundError(surfaceId);
    }
    return this.repo.listScreens(surfaceId);
  }

  /** Crée un écran sous une surface — 404 si la surface est absente. */
  async createScreen(surfaceId: string, body: ScreenCreateBody): Promise<ScreenRecord> {
    if (!(await this.repo.findSurfaceById(surfaceId))) {
      throw new SurfaceNotFoundError(surfaceId);
    }
    return this.repo.createScreen(surfaceId, {
      name: body.name,
      template: body.template,
      legalMentions: body.legalMentions ?? null,
      isActive: body.isActive,
    });
  }

  /** Met à jour un écran (partiel) — 404 si absent. */
  async updateScreen(id: string, body: ScreenUpdateBody): Promise<ScreenRecord> {
    if (!(await this.repo.findScreenById(id))) {
      throw new ScreenNotFoundError(id);
    }
    const data: Partial<{
      name: string;
      template: ScreenRecord["template"];
      legalMentions: string | null;
      isActive: boolean;
    }> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.template !== undefined) data.template = body.template;
    if (body.legalMentions !== undefined) data.legalMentions = body.legalMentions;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    return this.repo.updateScreen(id, data);
  }

  /** Supprime un écran (cascade sur ses produits en schéma) — 404 si absent. */
  async deleteScreen(id: string): Promise<void> {
    if (!(await this.repo.findScreenById(id))) {
      throw new ScreenNotFoundError(id);
    }
    await this.repo.deleteScreen(id);
  }

  // ── Produits d'un écran ───────────────────────────────────────────────────

  /**
   * Remplace la sélection d'un écran — 404 si l'écran est absent, 404 si un
   * `catalogItemId` n'existe pas. L'unicité intra-liste est déjà validée par le
   * schéma ({{M7-08}} `screenItemsBody`).
   */
  async replaceScreenItems(id: string, body: ScreenItemsBody): Promise<{ count: number }> {
    if (!(await this.repo.findScreenById(id))) {
      throw new ScreenNotFoundError(id);
    }
    const items: ScreenItemRecord[] = body.items.map((item) => ({
      catalogItemId: item.catalogItemId,
      isNew: item.isNew,
      isFavorite: item.isFavorite,
      isSpecial: item.isSpecial,
      priceCents: item.priceCents ?? null,
      sortOrder: item.sortOrder,
    }));
    await this.assertCatalogItems(items.map((i) => i.catalogItemId));
    await this.repo.replaceScreenItems(id, items);
    return { count: items.length };
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  /**
   * Rendu synchronisé au stock d'un écran — 404 si absent. Charge les produits, en
   * dérive le niveau de stock courant (M5) et applique `selectDisplayItems` (M7-01) :
   * **seuls les produits disponibles (stock > 0)** sont renvoyés, triés et flags
   * résolus. `now` injectable (testable). Le `syncToken` est un hash du rendu.
   */
  async renderScreen(id: string, now: Date = new Date()): Promise<ScreenRender> {
    const data = await this.repo.getScreenRenderData(id);
    if (!data) {
      throw new ScreenNotFoundError(id);
    }
    const stock = await this.repo.stockLevelsFor(data.items.map((i) => i.catalogItemId));
    const items = selectDisplayItems(data.items, stock, now);

    const screen = {
      id: data.screen.id,
      name: data.screen.name,
      template: data.screen.template,
      legalMentions: data.screen.legalMentions,
      surface: data.surface,
    };
    return { screen, items, syncedAt: now, syncToken: syncTokenOf(screen, items) };
  }

  // ── Gardes internes ───────────────────────────────────────────────────────

  /** Aucune autre surface ne porte déjà ce nom (unicité) — 409 sinon. */
  private async assertSurfaceNameFree(name: string, excludeId: string | null): Promise<void> {
    const clash = await this.repo.findSurfaceByName(name);
    if (clash && clash.id !== excludeId) {
      throw new SurfaceConflictError(name);
    }
  }

  /** Tous les `catalogItemId` doivent exister — 404 (liste des manquants) sinon. */
  private async assertCatalogItems(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const existing = await this.repo.existingCatalogItemIds(ids);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new DisplayCatalogItemNotFoundError(missing);
    }
  }
}

/**
 * Empreinte **déterministe** du rendu affiché : template + mentions + liste projetée
 * (produits visibles, prix, flags, ordre). Un produit qui tombe à 0 (donc disparaît),
 * un flag/prix/ordre qui change ou des mentions modifiées → hash différent. Base du
 * « changement significatif » côté front (M7-13). Insensible à `now`.
 */
function syncTokenOf(screen: ScreenRender["screen"], items: RenderedDisplayItem[]): string {
  const canonical = JSON.stringify({
    template: screen.template,
    legalMentions: screen.legalMentions,
    items: items.map((i) => [i.catalogItemId, i.priceCents, i.sortOrder, i.flags]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
