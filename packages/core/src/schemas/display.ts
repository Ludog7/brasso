/**
 * Schémas Zod du **module d'affichage** (Prisma `DisplaySurface` /
 * `DisplayScreen` / `DisplayScreenItem`, M7-02, §Module d'affichage). ADR-04 /
 * ADR-03. Les libellés (surface, mentions légales) sont **texte libre** (ADR-01,
 * aucune constante métier codée en dur) ; `core` ne fournit que la structure.
 */

import { z } from "zod";

import { displayTemplateSchema } from "./enums.js";

/** Surface d'affichage (Bar, Salle, Événement — nom **libre**, ADR-01). */
export const displaySurfaceInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
});

/**
 * Écran d'une surface : template de rendu + mentions légales (**texte libre**
 * porté par l'écran — alcool/allergènes, aucune formulation réglementaire en dur).
 */
export const displayScreenInputSchema = z.object({
  name: z.string().min(1),
  template: displayTemplateSchema.default("CARDS"),
  legalMentions: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
});

/**
 * Produit sélectionné sur un écran + ses indicateurs (« nouveau »/« coup de
 * cœur »/« brassin spécial »). `priceCents` : prix affiché optionnel (centimes).
 * Aligné sur `DisplayScreenItem` (M7-02).
 */
export const displayScreenItemInputSchema = z.object({
  catalogItemId: z.string().min(1),
  isNew: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  isSpecial: z.boolean().default(false),
  priceCents: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export type DisplaySurfaceInput = z.infer<typeof displaySurfaceInputSchema>;
export type DisplayScreenInput = z.infer<typeof displayScreenInputSchema>;
export type DisplayScreenItemInput = z.infer<typeof displayScreenItemInputSchema>;
