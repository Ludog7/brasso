import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { DisplayRepository } from "./repository.js";
import { PrismaDisplayRepository } from "./repository.js";
import {
  screenCreateBody,
  screenItemsBody,
  screenUpdateBody,
  surfaceCreateBody,
  surfaceUpdateBody,
} from "./schema.js";
import { DisplayService } from "./service.js";

export interface DisplayRoutesOptions {
  /** Repository affichage injecté (tests) ; sinon adossé à Prisma. */
  repository?: DisplayRepository;
}

const idParams = z.object({ id: z.string().min(1) });
const surfaceIdParams = z.object({ surfaceId: z.string().min(1) });

/**
 * Module `display` (M7-08) — configuration du **module d'affichage** (surfaces /
 * écrans / produits) + **rendu synchronisé au stock**. RBAC deny-by-default sur la
 * ressource `affichage` (§3.5) : `admin` CRUD, `brasseur`/`caisse` lecture + mise à
 * jour (RU), `rgpd` aucun. Le rendu (`read`) n'expose que les produits disponibles.
 */
export const displayRoutes: FastifyPluginAsync<DisplayRoutesOptions> = async (app, opts) => {
  const service = new DisplayService(opts.repository ?? new PrismaDisplayRepository(prisma));

  // ── Surfaces ──────────────────────────────────────────────────────────────

  app.get("/display/surfaces", { config: app.rbac("affichage", "read") }, async () => {
    return { surfaces: await service.listSurfaces() };
  });

  app.post("/display/surfaces", { config: app.rbac("affichage", "create") }, async (req, reply) => {
    const body = surfaceCreateBody.parse(req.body);
    return reply.code(201).send({ surface: await service.createSurface(body) });
  });

  app.patch("/display/surfaces/:id", { config: app.rbac("affichage", "update") }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = surfaceUpdateBody.parse(req.body);
    return { surface: await service.updateSurface(id, body) };
  });

  app.delete(
    "/display/surfaces/:id",
    { config: app.rbac("affichage", "delete") },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      await service.deleteSurface(id);
      return reply.code(204).send();
    },
  );

  // ── Écrans ────────────────────────────────────────────────────────────────

  app.get(
    "/display/surfaces/:surfaceId/screens",
    { config: app.rbac("affichage", "read") },
    async (req) => {
      const { surfaceId } = surfaceIdParams.parse(req.params);
      return { screens: await service.listScreens(surfaceId) };
    },
  );

  app.post(
    "/display/surfaces/:surfaceId/screens",
    { config: app.rbac("affichage", "create") },
    async (req, reply) => {
      const { surfaceId } = surfaceIdParams.parse(req.params);
      const body = screenCreateBody.parse(req.body);
      return reply.code(201).send({ screen: await service.createScreen(surfaceId, body) });
    },
  );

  app.patch("/display/screens/:id", { config: app.rbac("affichage", "update") }, async (req) => {
    const { id } = idParams.parse(req.params);
    const body = screenUpdateBody.parse(req.body);
    return { screen: await service.updateScreen(id, body) };
  });

  app.delete(
    "/display/screens/:id",
    { config: app.rbac("affichage", "delete") },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      await service.deleteScreen(id);
      return reply.code(204).send();
    },
  );

  // ── Produits d'un écran ─────────────────────────────────────────────────────

  app.put(
    "/display/screens/:id/items",
    { config: app.rbac("affichage", "update") },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const body = screenItemsBody.parse(req.body);
      return service.replaceScreenItems(id, body);
    },
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────

  app.get("/display/screens/:id/render", { config: app.rbac("affichage", "read") }, async (req) => {
    const { id } = idParams.parse(req.params);
    return service.renderScreen(id);
  });
};
