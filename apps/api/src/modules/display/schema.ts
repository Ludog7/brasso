/**
 * Schémas Zod du module `display` (M7-08) — configuration du **module d'affichage**
 * (surfaces / écrans / produits affichés) et remplacement de la sélection d'un écran.
 * Les corps de création reprennent la **forme cible** des schémas d'affichage de
 * {{M7-01}} (`@brasso/core`, ADR-04) ; les mises à jour en sont la version partielle.
 */

import {
  displayScreenInputSchema,
  displayScreenItemInputSchema,
  displaySurfaceInputSchema,
} from "@brasso/core";
import { z } from "zod";

/** Au moins un champ à mettre à jour (corps `PATCH` non vide). */
const atLeastOne = { message: "Au moins un champ à mettre à jour" } as const;

// ── Surfaces ────────────────────────────────────────────────────────────────

/** Corps de `POST /display/surfaces` — forme cible core (M7-01). */
export const surfaceCreateBody = displaySurfaceInputSchema;
export type SurfaceCreateBody = z.infer<typeof surfaceCreateBody>;

/** Corps de `PATCH /display/surfaces/:id` — sous-ensemble modifiable, au moins un champ. */
export const surfaceUpdateBody = displaySurfaceInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, atLeastOne);
export type SurfaceUpdateBody = z.infer<typeof surfaceUpdateBody>;

// ── Écrans ──────────────────────────────────────────────────────────────────

/** Corps de `POST /display/surfaces/:surfaceId/screens` — forme cible core (M7-01). */
export const screenCreateBody = displayScreenInputSchema;
export type ScreenCreateBody = z.infer<typeof screenCreateBody>;

/** Corps de `PATCH /display/screens/:id` — sous-ensemble modifiable, au moins un champ. */
export const screenUpdateBody = displayScreenInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, atLeastOne);
export type ScreenUpdateBody = z.infer<typeof screenUpdateBody>;

// ── Produits d'un écran ───────────────────────────────────────────────────────

/**
 * Corps de `PUT /display/screens/:id/items` — **remplace** la sélection. Chaque
 * entrée suit `displayScreenItemInputSchema` (M7-01) ; un même `catalogItemId` ne
 * peut apparaître qu'une fois (contrainte d'unicité `(screenId, catalogItemId)`).
 */
export const screenItemsBody = z.object({
  items: z
    .array(displayScreenItemInputSchema)
    .refine((items) => new Set(items.map((i) => i.catalogItemId)).size === items.length, {
      message: "Un même produit ne peut être sélectionné deux fois sur un écran",
    }),
});
export type ScreenItemsBody = z.infer<typeof screenItemsBody>;
