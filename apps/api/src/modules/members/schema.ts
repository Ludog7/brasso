/**
 * Schémas Zod du module `members` (M6-04). Les corps de requête (création /
 * mise à jour / consentement) réutilisent les schémas **core** (ADR-04, source
 * unique) ; ce fichier n'ajoute que la query de liste.
 */

import { membershipStatusSchema } from "@brasso/core";
import { z } from "zod";

export {
  type ConsentInput,
  consentInputSchema,
  type MemberCreateInput,
  memberCreateSchema,
  type MemberUpdateInput,
  memberUpdateSchema,
} from "@brasso/core";

/** Filtres + pagination de `GET /members`. Le filtre `membership` porte sur le cache. */
export const memberListQuery = z.object({
  search: z.string().min(1).optional(),
  membership: membershipStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type MemberListQuery = z.infer<typeof memberListQuery>;
