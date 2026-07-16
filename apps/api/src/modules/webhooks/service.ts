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

import type { ExternalSaleInput } from "@brasso/core";
import type { ExternalProviderKind, Prisma } from "@brasso/db";
import { ZodError } from "zod";

import type { WebhookProviderRecord, WebhookRepository } from "./repository.js";
import { normalizeMembershipEvent, normalizeSumUpSale, normalizeZettleSale } from "./schema.js";
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

/**
 * Sink d'échec d'ingestion **post-signature** (émission `WEBHOOK_FAILURE`, M7-06).
 * Best-effort : appelé quand la normalisation/persistance échoue **après** une
 * signature valide — jamais sur un échec de signature (bruit/attaques).
 */
export type WebhookFailureSink = (providerId: string, message: string) => Promise<void>;

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
  /** Email du payeur extrait du payload (auto-rapprochement M6-08, post-traitement). */
  payerEmail: string | null;
}

/**
 * Résultat d'ingestion d'une **vente** (M7-03) : création ou rejeu idempotent.
 * Pas de `payerEmail` (notion propre aux cotisations) ; le rapprochement
 * vente→stock (M7-05) se branchera sur le `transactionId`.
 */
export interface SaleIngestResult {
  status: "created" | "duplicate";
  transactionId: string;
}

export class WebhookService {
  constructor(
    private readonly repo: WebhookRepository,
    private readonly secretResolver: SecretResolver = (ref) => process.env[ref],
    private readonly onPostSignatureFailure?: WebhookFailureSink,
  ) {}

  /**
   * Ingère un événement de cotisation HelloAsso signé (M6-07). Ordre strict :
   * provider → **signature (sur octets bruts)** → extraction → persistance
   * idempotente. Aucune écriture avant une signature valide.
   */
  async ingestHelloAsso(input: WebhookIngestInput): Promise<WebhookIngestResult> {
    const provider = await this.authenticate("HELLOASSO", input);

    return this.runPostSignature(provider.id, async () => {
      // Contenu digne de confiance seulement maintenant : on projette le payload
      // (déjà parsé par le content-type parser) et on conserve l'original intégral.
      const normalized = normalizeMembershipEvent(input.payload);

      const existing = await this.repo.findTransaction(provider.id, normalized.externalId);
      if (existing) {
        return {
          status: "duplicate" as const,
          transactionId: existing.id,
          payerEmail: normalized.payerEmail,
        };
      }

      const created = await this.repo.insertTransaction({
        providerId: provider.id,
        externalId: normalized.externalId,
        kind: "MEMBERSHIP",
        amountCents: normalized.amountCents,
        currency: normalized.currency,
        paymentMethod: normalized.paymentMethod,
        externalProductId: null,
        occurredAt: normalized.occurredAt,
        rawPayload: input.payload as Prisma.InputJsonValue,
      });
      return {
        status: "created" as const,
        transactionId: created.id,
        payerEmail: normalized.payerEmail,
      };
    });
  }

  /** Ingère une vente **SumUp** signée → `ExternalTransaction` `SALE`/`UNMAPPED` (M7-03). */
  async ingestSumUp(input: WebhookIngestInput): Promise<SaleIngestResult> {
    return this.ingestSale("SUMUP", normalizeSumUpSale, input);
  }

  /** Ingère une vente **Zettle** signée → `ExternalTransaction` `SALE`/`UNMAPPED` (M7-03). */
  async ingestZettle(input: WebhookIngestInput): Promise<SaleIngestResult> {
    return this.ingestSale("ZETTLE", normalizeZettleSale, input);
  }

  /**
   * Flux commun d'ingestion d'une vente terminal (SumUp/Zettle). Même contrat que
   * la cotisation : provider → signature → normalisation → persistance idempotente
   * (`kind = SALE`, `status = UNMAPPED`, `externalProductId` extrait). Ne crée
   * **aucun** mouvement de stock (le rapprochement vente→stock est M7-05).
   */
  private async ingestSale(
    kind: ExternalProviderKind,
    normalize: (payload: unknown) => ExternalSaleInput,
    input: WebhookIngestInput,
  ): Promise<SaleIngestResult> {
    const provider = await this.authenticate(kind, input);

    return this.runPostSignature(provider.id, async () => {
      const sale = normalize(input.payload);

      const existing = await this.repo.findTransaction(provider.id, sale.externalId);
      if (existing) {
        return { status: "duplicate" as const, transactionId: existing.id };
      }

      const created = await this.repo.insertTransaction({
        providerId: provider.id,
        externalId: sale.externalId,
        kind: "SALE",
        amountCents: sale.amountCents,
        currency: sale.currency,
        paymentMethod: sale.paymentMethod ?? null,
        externalProductId: sale.externalProductId ?? null,
        occurredAt: sale.occurredAt,
        rawPayload: input.payload as Prisma.InputJsonValue,
      });
      return { status: "created" as const, transactionId: created.id };
    });
  }

  /**
   * Exécute le traitement **post-signature** (normalisation + persistance) en
   * émettant une anomalie `WEBHOOK_FAILURE` si une erreur survient à ce stade
   * (best-effort), puis relance l'erreur d'origine (réponse générique au provider).
   * Un échec de signature (levé **avant** ce point) ne passe jamais ici → aucune
   * anomalie sur signature invalide.
   */
  private async runPostSignature<T>(providerId: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      await this.emitFailure(providerId, err);
      throw err;
    }
  }

  /** Émet l'anomalie d'échec (message technique **non sensible**), best-effort. */
  private async emitFailure(providerId: string, err: unknown): Promise<void> {
    if (!this.onPostSignatureFailure) {
      return;
    }
    const message =
      err instanceof ZodError
        ? "Normalisation du payload impossible"
        : "Échec d'ingestion du webhook";
    try {
      await this.onPostSignatureFailure(providerId, message);
    } catch {
      // Émission best-effort : ne jamais masquer l'erreur d'ingestion d'origine.
    }
  }

  /**
   * Flux d'authentification commun à tous les webhooks : lookup du provider actif
   * → résolution du secret (env) → **vérification de signature sur les octets
   * bruts**. Renvoie le provider vérifié ; lève **avant toute écriture** si le
   * provider est indisponible ou la signature absente/invalide.
   */
  private async authenticate(
    kind: ExternalProviderKind,
    input: WebhookIngestInput,
  ): Promise<WebhookProviderRecord> {
    const provider = await this.repo.findActiveProvider(kind);
    if (!provider) {
      throw new WebhookProviderUnavailableError(kind);
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

    return provider;
  }
}
