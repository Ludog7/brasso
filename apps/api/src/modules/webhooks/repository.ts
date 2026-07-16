/**
 * Accès aux données du module `webhooks` (M6-07) — lookup du fournisseur actif et
 * **persistance append-only** d'une transaction externe (ADR-09 : jamais modifiée,
 * payload brut conservé, verrouillée par trigger). Interface injectable pour un
 * repository en mémoire dans les tests.
 */

import type {
  ExternalProviderKind,
  ExternalTransactionKind,
  Prisma,
  PrismaClient,
} from "@brasso/db";

/** Vue DB-agnostique d'un fournisseur externe (le secret n'est PAS en base). */
export interface WebhookProviderRecord {
  id: string;
  kind: ExternalProviderKind;
  label: string;
  /** Nom de la variable d'environnement portant le secret de signature. */
  webhookSecretRef: string | null;
  isActive: boolean;
}

/** Transaction externe à insérer (normalisée + payload brut intégral). */
export interface ExternalTransactionInsert {
  providerId: string;
  externalId: string;
  /** Nature normalisée : `MEMBERSHIP` (cotisation M6-07) ou `SALE` (vente M7-03). */
  kind: ExternalTransactionKind;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  /** Référence produit du catalogue provider (clé du mapping M7-04) ; `null` si absente. */
  externalProductId: string | null;
  occurredAt: Date;
  rawPayload: Prisma.InputJsonValue;
}

/** Port d'accès webhooks (Prisma en prod, mémoire en test). */
export interface WebhookRepository {
  /** Premier fournisseur **actif** du type donné, ou `null` (absent/inactif). */
  findActiveProvider(kind: ExternalProviderKind): Promise<WebhookProviderRecord | null>;
  /** Transaction déjà ingérée pour ce couple `(providerId, externalId)` — idempotence. */
  findTransaction(providerId: string, externalId: string): Promise<{ id: string } | null>;
  /** Insère une transaction externe `UNMAPPED` (append-only), du `kind` fourni. */
  insertTransaction(data: ExternalTransactionInsert): Promise<{ id: string }>;
}

/** Adaptateur Prisma du module webhooks. */
export class PrismaWebhookRepository implements WebhookRepository {
  constructor(private readonly db: PrismaClient) {}

  async findActiveProvider(kind: ExternalProviderKind): Promise<WebhookProviderRecord | null> {
    return this.db.externalProvider.findFirst({
      where: { kind, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, label: true, webhookSecretRef: true, isActive: true },
    });
  }

  async findTransaction(providerId: string, externalId: string): Promise<{ id: string } | null> {
    return this.db.externalTransaction.findUnique({
      where: { providerId_externalId: { providerId, externalId } },
      select: { id: true },
    });
  }

  async insertTransaction(data: ExternalTransactionInsert): Promise<{ id: string }> {
    return this.db.externalTransaction.create({
      data: {
        providerId: data.providerId,
        externalId: data.externalId,
        kind: data.kind,
        amountCents: data.amountCents,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        externalProductId: data.externalProductId,
        status: "UNMAPPED",
        occurredAt: data.occurredAt,
        rawPayload: data.rawPayload,
      },
      select: { id: true },
    });
  }
}
