/**
 * Schéma Zod d'une **mesure de batch** (Prisma `BatchMeasure`, M1-01).
 *
 * Couvre gravity / temperature / ph / volume avec des bornes de plausibilité par
 * type (indicateurs de saisie, pas des verdicts). ADR-04/ADR-03.
 */

import { z } from "zod";

import { measureTypeSchema } from "./enums.js";

/** Densité SG brute plausible (bornes de saisie). */
export const GRAVITY_MIN = 0.99;
export const GRAVITY_MAX = 1.2;
/** Température de brassage/fermentation plausible (°C). */
export const TEMPERATURE_MIN_C = -20;
export const TEMPERATURE_MAX_C = 120;

/**
 * Mesure relevée sur un batch. Le `value` est validé selon `type` : densité en
 * SG brute, pH ∈ [0, 14], température en °C, volume ≥ 0.
 */
export const batchMeasureSchema = z
  .object({
    type: measureTypeSchema,
    value: z.number().finite(),
    unit: z.string().optional(),
    /** Phase Jour J ou de fermentation (texte libre côté DB). */
    phase: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    const fail = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message });
    };
    switch (m.type) {
      case "GRAVITY":
        if (m.value < GRAVITY_MIN || m.value > GRAVITY_MAX) {
          fail(`Densité hors plage plausible [${GRAVITY_MIN}, ${GRAVITY_MAX}] SG.`);
        }
        break;
      case "PH":
        if (m.value < 0 || m.value > 14) fail("pH hors plage [0, 14].");
        break;
      case "TEMPERATURE":
        if (m.value < TEMPERATURE_MIN_C || m.value > TEMPERATURE_MAX_C) {
          fail(`Température hors plage [${TEMPERATURE_MIN_C}, ${TEMPERATURE_MAX_C}] °C.`);
        }
        break;
      case "VOLUME":
        if (m.value < 0) fail("Volume négatif interdit.");
        break;
      case "OTHER":
        break;
    }
  });

export type BatchMeasureInput = z.infer<typeof batchMeasureSchema>;
