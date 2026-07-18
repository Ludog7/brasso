/**
 * Payloads de planification de batch (M3-04). Le corps de création est réduit à ce
 * que le client fournit : la **version**, le **snapshot** de recette et le **numéro**
 * sont posés côté serveur (ADR-06/07), jamais pilotés par le client.
 */

import {
  batchMeasureSchema,
  batchMilestoneKindSchema,
  batchStatusSchema,
  conditioningMethodSchema,
  cycleDurationDaysSchema,
  measureTypeSchema,
  packagingLineSchema,
} from "@brasso/core";
import { z } from "zod";

/** Corps de planification : référence une recette + un équipement optionnel. */
export const batchCreateBody = z.object({
  recipeId: z.string().min(1),
  equipmentProfileId: z.string().min(1).optional(),
  plannedAt: z.coerce.date().optional(),
});
export type BatchCreateBody = z.infer<typeof batchCreateBody>;

/** Filtres de liste (`GET /api/batches`). */
export const batchListQuery = z.object({
  status: batchStatusSchema.optional(),
  recipeId: z.string().min(1).optional(),
});
export type BatchListQuery = z.infer<typeof batchListQuery>;

/**
 * Corps d'une mesure append-only (M3-06). Réutilise `batchMeasureSchema` de core
 * (bornes de plausibilité par type) + un `loggedAt` optionnel : une relève peut
 * être antidatée (mesure prise plus tôt, saisie après coup). `loggedById` vient
 * de l'utilisateur courant, jamais du client.
 */
export const measureCreateBody = batchMeasureSchema.and(
  z.object({ loggedAt: z.coerce.date().optional() }),
);
export type MeasureCreateBody = z.infer<typeof measureCreateBody>;

/** Filtre de relecture des mesures (`GET /api/batches/:id/measures?type=`). */
export const measureListQuery = z.object({ type: measureTypeSchema.optional() });
export type MeasureListQuery = z.infer<typeof measureListQuery>;

/** Corps de transition de statut (`POST /api/batches/:id/status`). */
export const statusChangeBody = z.object({ status: batchStatusSchema });
export type StatusChangeBody = z.infer<typeof statusChangeBody>;

/**
 * Création de la séquence de jalons (`POST /api/batches/:id/milestones`, M9-07),
 * à la validation de l'ensemencement.
 *
 * Toutes les durées sont **optionnelles** : à défaut, celles des `Settings`
 * (M9-02) s'appliquent — `core` n'en code aucune (ADR-01). Les bornes `[0, 365]`
 * viennent de `cycleDurationDaysSchema` : une durée hors bornes est refusée, pas
 * écrêtée en silence (FORMULES §13.1).
 */
export const milestoneCreateBody = z.object({
  /** Instant d'ensemencement ; à défaut, l'horodatage serveur (ADR-08). */
  pitchedAt: z.coerce.date().optional(),
  fermentationDays: cycleDurationDaysSchema.optional(),
  dryHopDays: cycleDurationDaysSchema.optional(),
  coldCrashDays: cycleDurationDaysSchema.optional(),
  gardeDays: cycleDurationDaysSchema.optional(),
  /**
   * Force la présence d'un dry hop. Omis, elle est **déduite du `recipeSnapshot`**
   * par `core` : la recette fait foi, ce champ n'est là que pour un ajout décidé
   * à l'ensemencement.
   */
  hasDryHop: z.boolean().optional(),
});
export type MilestoneCreateBody = z.infer<typeof milestoneCreateBody>;

/** Jalon ciblé par un ajustement (`PATCH /api/batches/:id/milestones/:kind`). */
export const milestoneParams = z.object({ kind: batchMilestoneKindSchema });

/**
 * Ajustement d'un jalon (M9-07) : sa durée prévue (recalcul en cascade des
 * suivants) et/ou ses dates **réelles**. `null` efface une date réelle.
 */
export const milestonePatchBody = z
  .object({
    plannedDurationDays: cycleDurationDaysSchema.optional(),
    actualStartAt: z.coerce.date().nullable().optional(),
    actualEndAt: z.coerce.date().nullable().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: "Aucun champ à ajuster : fournir une durée ou une date réelle.",
  });
export type MilestonePatchBody = z.infer<typeof milestonePatchBody>;

/**
 * Ligne de conditionnement saisie (`POST /api/batches/:id/packaging`, M9-08).
 * Le volume unitaire est celui **réellement rempli**, pas la contenance nominale
 * du catalogue. `containerItemId` absent = contenant non suivi en stock : aucune
 * sortie de stock ne sera écrite pour lui.
 */
const packagingLineBody = packagingLineSchema.extend({
  containerItemId: z.string().min(1).optional(),
  /**
   * Mise en condition de **cette ligne** (M9-15) : refermentation en bouteille
   * (la case à cocher côté écran) ou carbonatation forcée au fût. Par contenant
   * et non par brassin — fûts et bouteilles ne sont pas prêts en même temps.
   */
  conditioningMethod: conditioningMethodSchema.optional(),
  /** CO₂ visé (volumes, FORMULES §8.3) — requis pour une carbonatation forcée. */
  co2TargetVolumes: z.number().positive().optional(),
});

/** Corps d'un conditionnement : au moins une ligne de contenants. */
export const packagingRecordBody = z.object({
  lines: z.array(packagingLineBody).min(1),
  /** Nom de l'article produit fini ; à défaut, dérivé du numéro de brassin. */
  productName: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});
export type PackagingRecordBody = z.infer<typeof packagingRecordBody>;

/**
 * Relevé de carbonatation forcée (`POST /api/batches/:id/packaging/:lineId/carbonation`,
 * M9-15) : pression au détendeur en **bar** (unité interne) et température de la
 * bière. La conformité se juge contre la cible recalculée à cette température.
 */
export const carbonationReadingBody = z.object({
  pressureBar: z.number().nonnegative(),
  tempC: z.number().finite(),
  /** Altitude du site (ft) — corrige la pression cible (FORMULES §8.2). */
  altitudeFt: z.number().finite().optional(),
});
export type CarbonationReadingBody = z.infer<typeof carbonationReadingBody>;

/**
 * Aperçu de la pression à régler (`POST /api/batches/:id/packaging:pressure`) :
 * aide au réglage du détendeur avant tout relevé. N'écrit rien.
 */
export const carbonationTargetQuery = z.object({
  co2TargetVolumes: z.number().positive(),
  tempC: z.number().finite(),
  altitudeFt: z.number().finite().optional(),
});
export type CarbonationTargetQuery = z.infer<typeof carbonationTargetQuery>;

/**
 * Correction d'un conditionnement (`POST /api/batches/:id/packaging/corrections`).
 * Le registre étant append-only, on écrit un **mouvement inverse** : `delta`
 * signé, non nul, et un motif **obligatoire** — une correction sans motif est
 * intraçable.
 */
export const packagingCorrectionBody = z.object({
  /** Article à corriger ; à défaut, le produit fini du brassin. */
  catalogItemId: z.string().min(1).optional(),
  delta: z
    .number()
    .finite()
    .refine((d) => d !== 0, { message: "Le delta doit être non nul." }),
  note: z.string().min(1),
});
export type PackagingCorrectionBody = z.infer<typeof packagingCorrectionBody>;

/**
 * Aide à la saisie (`POST /api/batches/:id/packaging:split`) : propose une
 * répartition d'un volume en contenants (FORMULES §13.3). Ne écrit rien.
 */
export const packagingSplitQuery = z.object({
  volumeL: z.number().finite(),
  containers: z.array(z.object({ id: z.string().min(1), volumeL: z.number().finite() })).min(1),
});
export type PackagingSplitQuery = z.infer<typeof packagingSplitQuery>;

/**
 * Paramètres du coût de revient (`GET /api/batches/:id/cost`) : imputation bulk
 * forfaitaire (centimes) et nombre d'unités conditionnées (coût à l'unité).
 */
export const costQuery = z.object({
  bulkForfaitCents: z.coerce.number().int().nonnegative().optional(),
  packagedUnits: z.coerce.number().int().positive().optional(),
});
export type CostQuery = z.infer<typeof costQuery>;
