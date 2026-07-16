/**
 * Orchestration du module `webhooks` (M6-07) : lookup du fournisseur, vérification
 * de signature (la route est publique — la signature EST l'auth), extraction
 * normalisée puis **persistance idempotente** d'une cotisation en `ExternalTransaction`
 * (append-only, ADR-09). Fondation générique réutilisée par M7 (SumUp/Zettle).
 *
 * Le rapprochement cotisation→membre est **hors périmètre** (M6-08 branche sa
 * logique sur l'ingestion) : ici la transaction reste `UNMAPPED`, `memberId = null`.
 */

import type { IncomingHttpHeaders } from "node:http";

import type { Prisma } from "@brasso/db";

import type { WebhookRepository } from "./repository.js";
import { normalizeMembershipEvent } from "./schema.js";
import { verifyWebhookSignature } from "./signature.js";

/** Fournisseur absent ou inactif → 404 maîtrisé (jamais de 500). */
export class WebhookProviderUnavailableError extends Error {
  readonly statusCode = 404;
  readonly code = "WEBHOOK_PROVIDER_UNAVAILABLE";
  constructor(kind: string) {
    super(`Aucun fournisseur ${kind} actif`);
    this.name = "WebhookProviderUnavailableError";
  }
}

/**
 * Signature absente/invalide → 401. Message et code **génériques** : on ne révèle
 * jamais la raison exacte d'un rejet (§ Sécurité).
 */
export class WebhookSignatureInvalidError extends Error {
  readonly statusCode = 401;
  readonly code = "WEBHOOK_SIGNATURE_INVALID";
  constructor() {
    super("Signature de webhook invalide");
    this.name = "WebhookSignatureInvalidError";
  }
}

/**
 * Secret introuvable en environnement (mauvaise configuration serveur). Réponse
 * **identique** à une signature invalide (même code/statut, aucune fuite vers le
 * client) ; la route la distingue pour **journaliser** l'incident côté ops.
 */
export class WebhookSecretMisconfiguredError extends WebhookSignatureInvalidError {
  constructor(readonly secretRef: string | null) {
    super();
    this.name = "WebhookSecretMisconfiguredError";
  }
}

/** Résout un secret depuis l'environnement (nom = `provider.webhookSecretRef`). */
export type SecretResolver = (ref: string) => string | undefined;

/** Entrée d'ingestion : octets bruts (signature) + en-têtes + payload déjà parsé. */
export interface WebhookIngestInput {
  rawBody: Buffer;
  headers: IncomingHttpHeaders;
  payload: unknown;
}

/** Résultat d'ingestion : création effective ou rejeu idempotent. */
export interface WebhookIngestResult {
  status: "created" | "duplicate";
  transactionId: string;
}

export class WebhookService {
  constructor(
    private readonly repo: WebhookRepository,
    private readonly secretResolver: SecretResolver = (ref) => process.env[ref],
  ) {}

  /**
   * Ingère un événement de cotisation HelloAsso signé. Ordre strict : provider →
   * **signature (sur octets bruts)** → extraction → persistance idempotente. Aucune
   * écriture avant une signature valide.
   */
  async ingestHelloAsso(input: WebhookIngestInput): Promise<WebhookIngestResult> {
    const provider = await this.repo.findActiveProvider("HELLOASSO");
    if (!provider) {
      throw new WebhookProviderUnavailableError("HELLOASSO");
    }

    const secret = provider.webhookSecretRef
      ? this.secretResolver(provider.webhookSecretRef)
      : undefined;
    if (!secret) {
      throw new WebhookSecretMisconfiguredError(provider.webhookSecretRef);
    }

    const valid = verifyWebhookSignature(provider.kind, {
      secret,
      rawBody: input.rawBody,
      headers: input.headers,
    });
    if (!valid) {
      throw new WebhookSignatureInvalidError();
    }

    // Contenu digne de confiance seulement maintenant : on projette le payload
    // (déjà parsé par le content-type parser) et on conserve l'original intégral.
    const normalized = normalizeMembershipEvent(input.payload);

    const existing = await this.repo.findTransaction(provider.id, normalized.externalId);
    if (existing) {
      return { status: "duplicate", transactionId: existing.id };
    }

    const created = await this.repo.insertTransaction({
      providerId: provider.id,
      externalId: normalized.externalId,
      amountCents: normalized.amountCents,
      currency: normalized.currency,
      paymentMethod: normalized.paymentMethod,
      occurredAt: normalized.occurredAt,
      rawPayload: input.payload as Prisma.InputJsonValue,
    });
    return { status: "created", transactionId: created.id };
  }
}
