/**
 * Orchestration du module `mapping` (M7-04) — CRUD des correspondances SKU↔produit
 * externe, clé du rapprochement vente→stock ({{M7-05}}). Garde-fous : unicité
 * `(providerId, externalProductId)` et `internalSku` (**409**), intégrité de
 * `catalogItemId` s'il est fourni (**404**), 404 sur cible absente. Aucun accès aux
 * transactions ici (lecture read-only dans le module `transactions`, ADR-09).
 */

import type { MappingRecord, MappingRepository, MappingWriteData } from "./repository.js";
import type { MappingCreateBody, MappingUpdateBody } from "./schema.js";

/** Mapping introuvable → 404. */
export class MappingNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "MAPPING_NOT_FOUND";
  constructor(id: string) {
    super(`Mapping ${id} introuvable`);
    this.name = "MappingNotFoundError";
  }
}

/** Article de catalogue référencé inexistant → 404 (intégrité référentielle). */
export class MappingCatalogItemNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "CATALOG_ITEM_NOT_FOUND";
  constructor(id: string) {
    super(`Article de catalogue ${id} introuvable`);
    this.name = "MappingCatalogItemNotFoundError";
  }
}

/** Doublon d'unicité `(providerId, externalProductId)` ou `internalSku` → 409. */
export class MappingConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "MAPPING_CONFLICT";
  constructor(readonly details: { field: "internalSku" | "providerExternalProduct" }) {
    super(`Mapping en conflit (${details.field})`);
    this.name = "MappingConflictError";
  }
}

export class MappingService {
  constructor(private readonly repo: MappingRepository) {}

  /** Liste paginée des mappings (filtrable par fournisseur), `createdAt` desc. */
  async list(filters: {
    providerId?: string;
    limit: number;
    offset: number;
  }): Promise<{ mappings: MappingRecord[]; total: number }> {
    return this.repo.list(filters);
  }

  /** Crée un mapping : intégrité `catalogItemId` puis unicité, sinon 404/409. */
  async create(body: MappingCreateBody): Promise<MappingRecord> {
    const data: MappingWriteData = {
      internalSku: body.internalSku,
      catalogItemId: body.catalogItemId ?? null,
      providerId: body.providerId,
      externalProductId: body.externalProductId,
      externalCategory: body.externalCategory ?? null,
    };
    await this.assertCatalogItem(data.catalogItemId);
    await this.assertUnique(data.providerId, data.externalProductId, data.internalSku, null);
    return this.repo.create(data);
  }

  /** Met à jour un mapping (partiel) : 404 si absent, intégrité + unicité revérifiées. */
  async update(id: string, body: MappingUpdateBody): Promise<MappingRecord> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new MappingNotFoundError(id);
    }

    // Ne toucher que les champs fournis (absent = inchangé ; `catalogItemId: null` = détache).
    const data: Partial<MappingWriteData> = {};
    if (body.internalSku !== undefined) data.internalSku = body.internalSku;
    if (body.catalogItemId !== undefined) data.catalogItemId = body.catalogItemId;
    if (body.providerId !== undefined) data.providerId = body.providerId;
    if (body.externalProductId !== undefined) data.externalProductId = body.externalProductId;
    if (body.externalCategory !== undefined) data.externalCategory = body.externalCategory;

    if (data.catalogItemId != null) {
      await this.assertCatalogItem(data.catalogItemId);
    }

    // Unicité sur les valeurs effectives (nouvelle valeur si fournie, sinon l'actuelle).
    const providerId = data.providerId ?? existing.providerId;
    const externalProductId = data.externalProductId ?? existing.externalProductId;
    const internalSku = data.internalSku ?? existing.internalSku;
    await this.assertUnique(providerId, externalProductId, internalSku, id);

    return this.repo.update(id, data);
  }

  /** Supprime un mapping — 404 si absent. */
  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new MappingNotFoundError(id);
    }
    await this.repo.delete(id);
  }

  /** L'article de catalogue référencé doit exister (si un id est fourni). */
  private async assertCatalogItem(catalogItemId: string | null): Promise<void> {
    if (catalogItemId === null) {
      return;
    }
    if (!(await this.repo.catalogItemExists(catalogItemId))) {
      throw new MappingCatalogItemNotFoundError(catalogItemId);
    }
  }

  /** Aucun autre mapping ne porte déjà ce couple provider/produit ni ce SKU interne. */
  private async assertUnique(
    providerId: string,
    externalProductId: string,
    internalSku: string,
    excludeId: string | null,
  ): Promise<void> {
    const byProduct = await this.repo.findByProviderProduct(providerId, externalProductId);
    if (byProduct && byProduct.id !== excludeId) {
      throw new MappingConflictError({ field: "providerExternalProduct" });
    }
    const bySku = await this.repo.findByInternalSku(internalSku);
    if (bySku && bySku.id !== excludeId) {
      throw new MappingConflictError({ field: "internalSku" });
    }
  }
}
