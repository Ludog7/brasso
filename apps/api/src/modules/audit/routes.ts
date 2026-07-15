import { prisma } from "@brasso/db";
import type { FastifyPluginAsync } from "fastify";

import type { AuditEntryRecord, AuditRepository } from "./repository.js";
import { PrismaAuditRepository } from "./repository.js";
import { auditListQuery } from "./schema.js";
import { AuditService } from "./service.js";

export interface AuditRoutesOptions {
  /** Repository injecté (tests) ; sinon adossé à Prisma. */
  repository?: AuditRepository;
}

/** Entrée d'audit sérialisée (dates ISO) — contrat stable pour le front. */
export interface AuditEntryView {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  memberId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
}

function toView(entry: AuditEntryRecord): AuditEntryView {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}

/**
 * Module `audit` (M6-03) — consultation du journal d'audit append-only (§3.4).
 * RBAC deny-by-default sur la ressource `auditLog` (matrice §3.5) : lecture
 * réservée à `admin` et `rgpd` ; tous les autres rôles → 403.
 *
 * Pas d'endpoint d'écriture : l'audit s'écrit via le helper `AuditService.record`
 * appelé en interne par les modules membres/RGPD/rapprochement (M6-04+).
 */
export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (app, opts) => {
  const repository = opts.repository ?? new PrismaAuditRepository(prisma);
  const service = new AuditService(repository);

  app.get("/audit", { config: app.rbac("auditLog", "read") }, async (request) => {
    const { limit, offset, ...filters } = auditListQuery.parse(request.query);
    const { entries, total } = await service.list({ ...filters, limit, offset });
    return { entries: entries.map(toView), total, limit, offset };
  });
};
