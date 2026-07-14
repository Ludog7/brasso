/**
 * Routes de la **session Jour J** (M4-04/M4-05) : démarrer, charger et **piloter**
 * le déroulé d'un brassage sur tablette. RBAC sur la ressource `recettes`
 * (domaine brassage, matrice §3.5 figée ADR-10) — mutations = `update`,
 * lecture = `read`. Le rejeu d'une file offline (M4-06) est un autre ticket.
 */

import { dayEventSchema } from "@brasso/core";
import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { type DayRepository, PrismaBatchDayRepository } from "./day.repository.js";
import { BatchDayService } from "./day.service.js";

export interface BatchDayRoutesOptions {
  /** Repository de session Jour J injecté (tests) ; sinon adossé à Prisma. */
  dayRepository?: DayRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/**
 * Corps d'un événement Jour J. En mode **en ligne**, l'`at` est optionnel : le
 * serveur l'horodate (`Date.now()`) s'il est absent ; en mode **file** (M4-06),
 * l'appelant fournit l'`at` capté hors-ligne. Validé ensuite par `dayEventSchema`.
 */
const dayEventBody = z.preprocess((value) => {
  if (value !== null && typeof value === "object" && (value as { at?: unknown }).at === undefined) {
    return { ...(value as object), at: Date.now() };
  }
  return value;
}, dayEventSchema);

/**
 * Corps de la synchro offline (M4-06) : une file d'événements, chacun identifié
 * par un `clientEventId` (idempotence) et portant l'`at` **capté hors-ligne** (donc
 * requis ici, pas d'horodatage serveur). L'ordre est rétabli côté service par `at`.
 */
const daySyncBody = z.object({
  events: z.array(z.object({ clientEventId: z.string().min(1), event: dayEventSchema })),
});

export const batchDayRoutes: FastifyPluginAsync<BatchDayRoutesOptions> = async (app, opts) => {
  const repository = opts.dayRepository ?? new PrismaBatchDayRepository(prisma);
  const service = new BatchDayService(repository);

  app.post(
    "/batches/:id/day/start",
    { config: app.rbac("recettes", "update") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { created, day } = await service.start(id);
      return reply.code(created ? 201 : 200).send({ day });
    },
  );

  app.get("/batches/:id/day", { config: app.rbac("recettes", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { day: await service.get(id) };
  });

  app.get(
    "/batches/:id/day/deviations",
    { config: app.rbac("recettes", "read") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return { deviations: await service.deviations(id) };
    },
  );

  app.post(
    "/batches/:id/day/events",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const event = dayEventBody.parse(request.body);
      return { day: await service.applyEvent(id, event, request.user?.id ?? null) };
    },
  );

  app.post(
    "/batches/:id/day/events:sync",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const { events } = daySyncBody.parse(request.body);
      return { day: await service.sync(id, events, request.user?.id ?? null) };
    },
  );
};
