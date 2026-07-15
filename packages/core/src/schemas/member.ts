/**
 * Schémas Zod des **membres & consentements** (Prisma `Member` / `MemberConsent`,
 * M1-01, §3.4). ADR-04 (Zod dans core) / ADR-03 (zéro dépendance DB/UI).
 *
 * Minimisation (§6) : `birthDate` reste **optionnelle** — ne la demander que si
 * nécessaire. Le `memberNumber` n'est pas modifiable après création (absent du
 * schéma d'update).
 */

import { z } from "zod";

import { associativeRoleSchema, consentTypeSchema } from "./enums.js";

/** Champs d'identité d'un membre, communs à la création et à la mise à jour. */
const memberIdentitySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  /** Minimisation (§6) : optionnelle, à ne renseigner que si nécessaire. */
  birthDate: z.coerce.date().optional(),
  roles: z.array(associativeRoleSchema).default([]),
});

/** Création d'un membre : identité + numéro d'adhérent (unique côté API). */
export const memberCreateSchema = memberIdentitySchema.extend({
  memberNumber: z.string().min(1),
});

/**
 * Mise à jour (rectification RGPD) : identité partielle, au moins un champ.
 * `memberNumber` **immuable** → volontairement hors du schéma.
 */
export const memberUpdateSchema = memberIdentitySchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Au moins un champ à mettre à jour.",
  });

/** Un événement de consentement (append-only) : octroi ou retrait d'un type. */
export const consentInputSchema = z.object({
  type: consentTypeSchema,
  granted: z.boolean(),
});

export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type ConsentInput = z.infer<typeof consentInputSchema>;
