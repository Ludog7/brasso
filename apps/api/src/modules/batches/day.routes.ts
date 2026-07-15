/**
 * Routes de la **session Jour J** (M4-04 → M4-07) : démarrer, charger, **piloter**
 * le déroulé d'un brassage sur tablette, rejouer la file offline (M4-06) et
 * proposer/journaliser les corrections densité pré-ébullition (M4-07). RBAC sur la
 * ressource `recettes` (domaine brassage, matrice §3.5 figée ADR-10) — mutations =
 * `update`, lecture = `read`.
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

/**
 * Mesures pré-ébullition relevées pour l'**aperçu** de correction (M4-07). Le
 * service reconstitue les cibles du modèle et délègue le chiffrage à `core`.
 */
const correctionPreviewBody = z.object({
  measuredGravity: z.number().gt(1),
  measuredVolumeL: z.number().positive(),
});

/** Types de correction miroir de l'enum Prisma `CorrectionType` (M4-03). */
const correctionTypeSchema = z.enum(["EXTEND_BOIL", "ADD_SUGAR", "DILUTE", "OTHER"]);

/**
 * Décision de correction retenue à **journaliser** (M4-07) : l'étape concernée, le
 * type et la proposition retenue (chiffres OG/ABV…) conservée telle quelle (JSONB).
 */
const correctionBody = z.object({
  stepId: z.string().min(1),
  type: correctionTypeSchema,
  payload: z.record(z.unknown()),
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

  // Corrections densité pré-ébullition (M4-07) — aide à la décision (ADR-11) :
  // aperçu chiffré (sans écriture) puis journalisation de la décision retenue.
  app.post(
    "/batches/:id/day/corrections/preview",
    { config: app.rbac("recettes", "update") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      const measurement = correctionPreviewBody.parse(request.body);
      return { preview: await service.previewCorrections(id, measurement) };
    },
  );

  app.post(
    "/batches/:id/day/corrections",
    { config: app.rbac("recettes", "update") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const decision = correctionBody.parse(request.body);
      const correction = await service.logCorrection(id, decision, request.user?.id ?? null);
      return reply.code(201).send({ correction });
    },
  );
};
