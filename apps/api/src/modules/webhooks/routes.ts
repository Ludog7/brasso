import { prisma } from "@brasso/db";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import type { WebhookRepository } from "./repository.js";
import { PrismaWebhookRepository } from "./repository.js";
import type {
  SaleIngestResult,
  SecretResolver,
  WebhookFailureSink,
  WebhookIngestInput,
} from "./service.js";
import { WebhookSecretMisconfiguredError, WebhookService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Corps brut (octets exacts) — requis pour vérifier la signature du webhook. */
    rawBody?: Buffer;
  }
}

/** Événement émis après ingestion d'une cotisation (auto-rapprochement M6-08). */
export interface MembershipIngestedEvent {
  transactionId: string;
  payerEmail: string | null;
}

/** Événement émis après ingestion d'une vente (rapprochement vente→stock M7-05). */
export interface SaleIngestedEvent {
  transactionId: string;
}

export interface WebhookRoutesOptions {
  /** Repository webhooks injecté (tests) ; sinon adossé à Prisma. */
  repository?: WebhookRepository;
  /** Résolveur de secret injecté (tests) ; sinon lecture directe de `process.env`. */
  secretResolver?: SecretResolver;
  /**
   * Post-traitement d'une cotisation **créée** (auto-rapprochement M6-08). Best-effort :
   * une erreur ici est journalisée mais **ne casse pas** l'ingestion (§M6-07/M6-08).
   */
  onMembershipIngested?: (event: MembershipIngestedEvent) => Promise<void>;
  /**
   * Post-traitement d'une vente **créée** (rapprochement vente→stock M7-05). Best-effort :
   * une erreur ici est journalisée mais **ne casse pas** l'ingestion (§ADR-09).
   */
  onSaleIngested?: (event: SaleIngestedEvent) => Promise<void>;
  /**
   * Émission d'une anomalie `WEBHOOK_FAILURE` sur échec d'ingestion **post-signature**
   * (M7-06). Best-effort ; jamais appelé sur un échec de signature (bruit/attaques).
   */
  onWebhookFailure?: WebhookFailureSink;
}

/**
 * Module `webhooks` (M6-07) — ingestion des cotisations HelloAsso. La route est
 * **publique par conception** (`rbacExempt`) : la **signature** vaut authentification.
 * Elle est **rate-limitée** (§6, socle réutilisé) et lit le **corps brut** (la
 * signature porte sur les octets exacts).
 *
 * Le content-type parser JSON est **surchargé localement** (contexte encapsulé de
 * ce plugin) pour conserver le buffer brut : le parsing JSON global des autres
 * modules n'est pas affecté.
 */
export const webhooksRoutes: FastifyPluginAsync<WebhookRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaWebhookRepository(prisma);
  const service = new WebhookService(repository, opts.secretResolver, opts.onWebhookFailure);

  // Raw body scopé à ce plugin : on garde les octets exacts (signature) tout en
  // exposant le JSON parsé via `request.body`. La `bodyLimit` par défaut (1 Mio)
  // borne la taille (au-delà → 413).
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request: FastifyRequest, body: Buffer, done) => {
      request.rawBody = body;
      try {
        done(null, body.length > 0 ? JSON.parse(body.toString("utf8")) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post(
    "/webhooks/helloasso",
    {
      // Hors RBAC (signature = auth) mais rate-limitée (socle §6).
      config: {
        rbacExempt: true,
        rateLimit: { max: app.config.RATE_LIMIT_MAX, timeWindow: app.config.RATE_LIMIT_WINDOW },
      },
    },
    async (request, reply) => {
      const rawBody = request.rawBody ?? Buffer.alloc(0);
      try {
        const result = await service.ingestHelloAsso({
          rawBody,
          headers: request.headers,
          payload: request.body,
        });
        // Auto-rapprochement (M6-08) : post-traitement d'une cotisation NOUVELLE.
        // Best-effort — jamais bloquant pour l'ingestion (ADR : append-only déjà persisté).
        if (result.status === "created" && opts.onMembershipIngested) {
          try {
            await opts.onMembershipIngested({
              transactionId: result.transactionId,
              payerEmail: result.payerEmail,
            });
          } catch (reconcileErr) {
            request.log.error(
              { err: reconcileErr, transactionId: result.transactionId },
              "Auto-rapprochement de cotisation échoué (cotisation conservée, à rapprocher)",
            );
          }
        }
        return reply.code(result.status === "created" ? 201 : 200).send({ status: result.status });
      } catch (err) {
        // Secret non configuré : incident ops (loggé), réponse générique au client.
        if (err instanceof WebhookSecretMisconfiguredError) {
          request.log.error(
            { secretRef: err.secretRef },
            "Webhook HelloAsso : secret introuvable en environnement",
          );
        }
        throw err;
      }
    },
  );

  /**
   * Routes de vente terminal (M7-03) — **même contrat que HelloAsso** : publiques
   * (la signature EST l'auth), rate-limitées, corps brut. Persistent une vente
   * normalisée `SALE`/`UNMAPPED` (idempotent). Le rapprochement vente→stock est
   * **hors périmètre** ({{M7-05}} branchera sa logique sur cette ingestion).
   */
  const registerSaleWebhook = (
    path: string,
    providerLabel: string,
    ingest: (input: WebhookIngestInput) => Promise<SaleIngestResult>,
  ): void => {
    app.post(
      path,
      {
        config: {
          rbacExempt: true,
          rateLimit: { max: app.config.RATE_LIMIT_MAX, timeWindow: app.config.RATE_LIMIT_WINDOW },
        },
      },
      async (request, reply) => {
        const rawBody = request.rawBody ?? Buffer.alloc(0);
        try {
          const result = await ingest({
            rawBody,
            headers: request.headers,
            payload: request.body,
          });
          // Rapprochement vente→stock (M7-05) : post-traitement d'une vente NOUVELLE.
          // Best-effort — jamais bloquant pour l'ingestion (append-only déjà persisté).
          if (result.status === "created" && opts.onSaleIngested) {
            try {
              await opts.onSaleIngested({ transactionId: result.transactionId });
            } catch (reconcileErr) {
              request.log.error(
                { err: reconcileErr, transactionId: result.transactionId },
                "Rapprochement vente→stock échoué (vente conservée, à re-traiter)",
              );
            }
          }
          return reply
            .code(result.status === "created" ? 201 : 200)
            .send({ status: result.status });
        } catch (err) {
          if (err instanceof WebhookSecretMisconfiguredError) {
            request.log.error(
              { secretRef: err.secretRef },
              `Webhook ${providerLabel} : secret introuvable en environnement`,
            );
          }
          throw err;
        }
      },
    );
  };

  registerSaleWebhook("/webhooks/sumup", "SumUp", (input) => service.ingestSumUp(input));
  registerSaleWebhook("/webhooks/zettle", "Zettle", (input) => service.ingestZettle(input));
};
