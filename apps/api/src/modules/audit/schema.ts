/**
 * Schémas Zod du module `audit` (M6-03) — consultation du journal (`GET /audit`).
 * L'écriture n'a pas de schéma HTTP : elle passe par le helper `record` appelé
 * en interne par les autres modules (pas d'endpoint d'écriture d'audit).
 */

import { z } from "zod";

/** Filtres + pagination de `GET /audit` (dates coercibles depuis la query). */
export const auditListQuery = z.object({
  memberId: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuditListQuery = z.infer<typeof auditListQuery>;
