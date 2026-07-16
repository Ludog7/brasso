import { prisma } from "@brasso/db";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import type { WebhookRepository } from "./repository.js";
import { PrismaWebhookRepository } from "./repository.js";
import type { SecretResolver } from "./service.js";
import { WebhookSecretMisconfiguredError, WebhookService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Corps brut (octets exacts) — requis pour vérifier la signature du webhook. */
    rawBody?: Buffer;
  }
}

export interface WebhookRoutesOptions {
  /** Repository webhooks injecté (tests) ; sinon adossé à Prisma. */
  repository?: WebhookRepository;
  /** Résolveur de secret injecté (tests) ; sinon lecture directe de `process.env`. */
  secretResolver?: SecretResolver;
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
  const service = new WebhookService(repository, opts.secretResolver);

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
};
