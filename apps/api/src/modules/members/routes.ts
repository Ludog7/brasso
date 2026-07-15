import { prisma } from "@brasso/db";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AuditRepository } from "../audit/repository.js";
import { PrismaAuditRepository } from "../audit/repository.js";
import { AuditService } from "../audit/service.js";
import type { MemberRepository } from "./repository.js";
import { PrismaMemberRepository } from "./repository.js";
import {
  consentInputSchema,
  memberCreateSchema,
  memberListQuery,
  memberUpdateSchema,
} from "./schema.js";
import { type Actor, MemberService } from "./service.js";

export interface MemberRoutesOptions {
  /** Repository membres injecté (tests) ; sinon adossé à Prisma. */
  repository?: MemberRepository;
  /** Repository d'audit partagé (tests) ; sinon adossé à Prisma. */
  auditRepository?: AuditRepository;
}

const idParams = z.object({ id: z.string().min(1) });

/** Extrait l'acteur (session + IP) d'une requête pour la traçabilité d'audit. */
function actorOf(request: FastifyRequest): Actor {
  return { userId: request.user?.id ?? null, ip: request.ip };
}

/**
 * Module `members` (M6-04) — fichier membres : CRUD identité + rôles associatifs,
 * statut de cotisation **dérivé** à la lecture, **audit** de chaque accès personnel.
 * RBAC deny-by-default sur la ressource `membres` (matrice §3.5) : CRUD réservé à
 * `admin` et `rgpd` ; `brasseur`/`caisse` → 403.
 */
export const membersRoutes: FastifyPluginAsync<MemberRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaMemberRepository(prisma);
  const auditRepository = opts.auditRepository ?? new PrismaAuditRepository(prisma);
  const service = new MemberService(repository, new AuditService(auditRepository));

  app.get("/members", { config: app.rbac("membres", "read") }, async (request) => {
    const { limit, offset, ...filters } = memberListQuery.parse(request.query);
    const { members, total } = await service.list({ ...filters, limit, offset });
    return { members, total, limit, offset };
  });

  app.get("/members/:id", { config: app.rbac("membres", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return { member: await service.get(id, actorOf(request)) };
  });

  app.post("/members", { config: app.rbac("membres", "create") }, async (request, reply) => {
    const body = memberCreateSchema.parse(request.body);
    const member = await service.create(body, actorOf(request));
    return reply.code(201).send({ member });
  });

  app.patch("/members/:id", { config: app.rbac("membres", "update") }, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = memberUpdateSchema.parse(request.body);
    return { member: await service.update(id, body, actorOf(request)) };
  });

  // Consentements historisés (M6-05) : lecture de l'état courant + historique.
  app.get("/members/:id/consents", { config: app.rbac("membres", "read") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return service.getConsents(id, actorOf(request));
  });

  // Ajout d'un événement de consentement (append-only) : octroi ou retrait.
  app.post(
    "/members/:id/consents",
    { config: app.rbac("membres", "update") },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const body = consentInputSchema.parse(request.body);
      const event = await service.addConsent(id, body, actorOf(request));
      return reply.code(201).send({ event });
    },
  );

  // RGPD — droit d'accès : export du dossier complet (réservé au rôle `rgpd`).
  app.get("/members/:id/export", { config: app.rbac("membres", "export") }, async (request) => {
    const { id } = idParams.parse(request.params);
    return service.exportDossier(id, actorOf(request));
  });

  // RGPD — droit à l'effacement : anonymisation irréversible (réservée à `rgpd`).
  app.post(
    "/members/:id/anonymize",
    { config: app.rbac("membres", "anonymize") },
    async (request) => {
      const { id } = idParams.parse(request.params);
      return { member: await service.anonymize(id, actorOf(request)) };
    },
  );
};
