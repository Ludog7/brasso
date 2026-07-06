import type { FastifyError } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";

/**
 * Réponses d'erreur homogènes : `{ error: { code, message, details? } }`.
 * - Erreurs de validation Zod → 400 avec `details`.
 * - Erreurs 5xx : la stack/message brut est masqué en production (§6).
 */
export default fp(
  (app, _opts, done) => {
    app.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Route ${request.method} ${request.url} introuvable`,
        },
      });
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
      if (error instanceof ZodError) {
        reply.status(400).send({
          error: {
            code: "VALIDATION",
            message: "Requête invalide",
            details: error.flatten(),
          },
        });
        return;
      }

      const status = error.statusCode ?? 500;
      if (status >= 500) {
        request.log.error({ err: error }, "Erreur non gérée");
      }

      const isProd = app.config.NODE_ENV === "production";
      const message = status >= 500 && isProd ? "Erreur interne du serveur" : error.message;
      const code = error.code ?? (status >= 500 ? "INTERNAL" : "ERROR");

      // Certaines erreurs métier (< 500) portent un `details` structuré (ex. la
      // liste des manquements d'une publication refusée). Jamais exposé en 5xx.
      const details = (error as { details?: unknown }).details;
      const body =
        status < 500 && details !== undefined ? { code, message, details } : { code, message };

      reply.status(status).send({ error: body });
    });

    done();
  },
  { name: "error-handler", dependencies: ["config"] },
);
