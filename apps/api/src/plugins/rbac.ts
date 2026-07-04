import type { FastifyReply, FastifyRequest, preHandlerHookHandler, RouteOptions } from "fastify";
import fp from "fastify-plugin";

import type { Action, Resource } from "../rbac/matrix.js";
import { can } from "../rbac/matrix.js";

/** Déclaration RBAC portée par une route (matrice §3.5). */
export interface RbacDeclaration {
  resource: Resource;
  action: Action;
}

declare module "fastify" {
  interface FastifyContextConfig {
    /** Couple (ressource, action) exigé — posé via `app.rbac(...)`. */
    rbac?: RbacDeclaration;
    /**
     * Route volontairement hors RBAC (santé, login, logout, me…). Doit être
     * **explicite** : c'est la seule échappatoire au deny-by-default.
     */
    rbacExempt?: boolean;
  }

  interface FastifyInstance {
    /**
     * Déclare le couple (ressource, action) exigé par une route. À placer dans
     * `config` : `app.get("/x", { config: app.rbac("recettes", "read") }, h)`.
     */
    rbac: (resource: Resource, action: Action) => { rbac: RbacDeclaration };
  }
}

/** Normalise `preHandler` (absent | fn | tableau) et préfixe la garde. */
function prependPreHandler(
  existing: RouteOptions["preHandler"],
  guard: preHandlerHookHandler,
): preHandlerHookHandler[] {
  if (!existing) {
    return [guard];
  }
  return Array.isArray(existing) ? [guard, ...existing] : [guard, existing];
}

/**
 * Plugin RBAC (M0-07, ADR-10). Deny-by-default : **à l'enregistrement de chaque
 * route** on impose une déclaration explicite (`config.rbac` ou
 * `config.rbacExempt`). Sans elle, la route est câblée pour répondre 403 —
 * impossible d'exposer une route par oubli.
 *
 * Chaîne d'une route protégée : authentification (401 si absente) puis
 * autorisation via la matrice §3.5 (403 si le rôle ne couvre pas l'action).
 */
export default fp(
  async (app) => {
    app.decorate("rbac", (resource: Resource, action: Action) => ({
      rbac: { resource, action },
    }));

    // Autorisation d'une route déclarée : auth puis matrice.
    const authorize =
      (decl: RbacDeclaration): preHandlerHookHandler =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        await app.authenticate(request, reply);
        // `authenticate` a répondu 401 sans peupler `request.user`.
        if (!request.user) {
          return;
        }
        if (!can(request.user.roles, decl.resource, decl.action)) {
          await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Accès refusé" } });
        }
      };

    // Filet deny-by-default : route enregistrée sans déclaration → 403 + alerte.
    const denyUndeclared: preHandlerHookHandler = async (request, reply) => {
      request.log.warn(
        { method: request.method, url: request.url },
        "Route sans déclaration RBAC — refus (deny-by-default)",
      );
      await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Accès refusé" } });
    };

    app.addHook("onRoute", (routeOptions) => {
      const config = routeOptions.config ?? {};
      if (config.rbacExempt === true) {
        return; // opt-out explicite : aucune garde ajoutée.
      }
      const guard = config.rbac ? authorize(config.rbac) : denyUndeclared;
      routeOptions.preHandler = prependPreHandler(routeOptions.preHandler, guard);
    });
  },
  { name: "rbac", dependencies: ["auth"] },
);
