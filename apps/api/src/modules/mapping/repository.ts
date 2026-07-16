/**
 * Accès aux données du module `mapping` (M7-04) — CRUD des `SkuMapping` et lookups
 * d'unicité `(providerId, externalProductId)` / `internalSku` (contraintes déjà en
 * schéma, {{M1-01}}). Interface injectable pour un repository mémoire en test.
 */

import type { CatalogKind, PrismaClient } from "@brasso/db";

/** Vue d'un mapping SKU (avec l'article de catalogue joint, s'il est rattaché). */
export interface MappingRecord {
  id: string;
  internalSku: string;
  catalogItemId: string | null;
  catalogItem: { id: string; name: string; kind: CatalogKind } | null;
  providerId: string;
  externalProductId: string;
  externalCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Filtres + pagination de la liste des mappings. */
export interface MappingListFilters {
  providerId?: string;
  limit: number;
  offset: number;
}

/** Données d'écriture normalisées (nullables résolus par le service). */
export interface MappingWriteData {
  internalSku: string;
  catalogItemId: string | null;
  providerId: string;
  externalProductId: string;
  externalCategory: string | null;
}

/** Port d'accès aux mappings (Prisma en prod, mémoire en test). */
export interface MappingRepository {
  list(filters: MappingListFilters): Promise<{ mappings: MappingRecord[]; total: number }>;
  findById(id: string): Promise<MappingRecord | null>;
  /** Mapping portant ce couple `(providerId, externalProductId)` — unicité. */
  findByProviderProduct(
    providerId: string,
    externalProductId: string,
  ): Promise<{ id: string } | null>;
  /** Mapping portant ce `internalSku` — unicité. */
  findByInternalSku(internalSku: string): Promise<{ id: string } | null>;
  /** L'article de catalogue existe-t-il ? (intégrité référentielle du mapping). */
  catalogItemExists(id: string): Promise<boolean>;
  create(data: MappingWriteData): Promise<MappingRecord>;
  update(id: string, data: Partial<MappingWriteData>): Promise<MappingRecord>;
  delete(id: string): Promise<void>;
}

/** Colonnes exposées (article de catalogue joint : nom/kind pour l'UI). */
const MAPPING_SELECT = {
  id: true,
  internalSku: true,
  catalogItemId: true,
  catalogItem: { select: { id: true, name: true, kind: true } },
  providerId: true,
  externalProductId: true,
  externalCategory: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Adaptateur Prisma du module mapping. */
export class PrismaMappingRepository implements MappingRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: MappingListFilters): Promise<{ mappings: MappingRecord[]; total: number }> {
    const where = filters.providerId !== undefined ? { providerId: filters.providerId } : {};
    const [mappings, total] = await Promise.all([
      this.db.skuMapping.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filters.offset,
        take: filters.limit,
        select: MAPPING_SELECT,
      }),
      this.db.skuMapping.count({ where }),
    ]);
    return { mappings, total };
  }

  async findById(id: string): Promise<MappingRecord | null> {
    return this.db.skuMapping.findUnique({ where: { id }, select: MAPPING_SELECT });
  }

  async findByProviderProduct(
    providerId: string,
    externalProductId: string,
  ): Promise<{ id: string } | null> {
    return this.db.skuMapping.findFirst({
      where: { providerId, externalProductId },
      select: { id: true },
    });
  }

  async findByInternalSku(internalSku: string): Promise<{ id: string } | null> {
    return this.db.skuMapping.findUnique({ where: { internalSku }, select: { id: true } });
  }

  async catalogItemExists(id: string): Promise<boolean> {
    const item = await this.db.catalogItem.findUnique({ where: { id }, select: { id: true } });
    return item !== null;
  }

  async create(data: MappingWriteData): Promise<MappingRecord> {
    return this.db.skuMapping.create({ data, select: MAPPING_SELECT });
  }

  async update(id: string, data: Partial<MappingWriteData>): Promise<MappingRecord> {
    return this.db.skuMapping.update({ where: { id }, data, select: MAPPING_SELECT });
  }

  async delete(id: string): Promise<void> {
    await this.db.skuMapping.delete({ where: { id } });
  }
}
