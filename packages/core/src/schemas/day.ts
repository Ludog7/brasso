/**
 * Schémas Zod du **Jour J** (M4-01, ADR-04) — validation des événements pilotant
 * la state machine côté API et round-trip de l'instantané sérialisable (persisté
 * en JSONB, M4-03).
 *
 * Alignés **valeur pour valeur** sur les types purs de la state machine (M1-13,
 * `stateMachine/types.ts`) : les listes sont recopiées, jamais importées de la DB
 * (ADR-03). Toute divergence avec ces types est un bug.
 *
 * Unités internes (CLAUDE.md) : durées en minutes, températures en °C, densité en
 * SG brute, volumes en L, instants (`at`) en **epoch ms** (entier ≥ 0).
 */

import { z } from "zod";

/** Phase canonique du Jour J (miroir de `Phase`, M1-13). */
export const phaseSchema = z.enum([
  "INITIALIZATION",
  "MASH",
  "LAUTER",
  "BOIL",
  "COOLING",
  "PITCHING",
]);

/** Nature d'une mesure (miroir de `MeasurementKind`). */
export const measurementKindSchema = z.enum(["density", "volume", "temperature", "ph"]);

/** Origine d'une mesure (miroir de `MeasurementSource`) — point d'extension IoT. */
export const measurementSourceSchema = z.enum(["manual", "sensor"]);

/** Statut de l'étape courante (miroir de `StepStatus`). */
export const stepStatusSchema = z.enum([
  "PENDING",
  "AWAITING_STABILIZATION",
  "TIMER_RUNNING",
  "AWAITING_VALIDATION",
  "COMPLETED",
]);

/** Instant en epoch ms : entier ≥ 0 (horodatage serveur, ADR-08). */
const epochMs = z.number().int().nonnegative();

// ─────────────────────────────────────────────────────────────────────────────
// Événements — union discriminée sur `type`. C'est le contrat d'entrée de l'API
// Jour J (M4-05) : chaque événement porte son instant `at` (la machine ne lit
// jamais l'horloge, ADR-08).
// ─────────────────────────────────────────────────────────────────────────────

/** Événement pilotant la state machine (miroir de `DayEvent`). */
export const dayEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START_STEP"), at: epochMs }),
  z.object({
    type: z.literal("CONFIRM_STABILIZATION"),
    at: epochMs,
    temperatureC: z.number().finite().optional(),
    source: measurementSourceSchema.optional(),
  }),
  z.object({
    type: z.literal("RECORD_MEASUREMENT"),
    at: epochMs,
    kind: measurementKindSchema,
    value: z.number().finite(),
    source: measurementSourceSchema.optional(),
  }),
  z.object({ type: z.literal("VALIDATE_STEP"), at: epochMs }),
  z.object({
    type: z.literal("FORCE_STEP"),
    at: epochMs,
    // « Forcer l'étape » impose une traçabilité : auteur + motif non vides (ADR-08).
    author: z.string().min(1),
    reason: z.string().min(1),
  }),
]);

export type DayEventInput = z.infer<typeof dayEventSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Plan & état — round-trip de l'instantané persisté en JSONB (M4-03).
// ─────────────────────────────────────────────────────────────────────────────

/** Spécification d'une étape du plan (miroir de `StepSpec`). */
export const stepSpecSchema = z.object({
  id: z.string().min(1),
  phase: phaseSchema,
  label: z.string().optional(),
  requiresStabilization: z.boolean(),
  plannedHoldMin: z.number().nonnegative().optional(),
  plannedRampMin: z.number().nonnegative().optional(),
  targetTempC: z.number().optional(),
  requiredMeasurements: z.array(measurementKindSchema).optional(),
});

/** Plan du Jour J : suite ordonnée d'étapes (miroir de `DayPlan`). */
export const dayPlanSchema = z.array(stepSpecSchema);

/** Mesure enregistrée pendant le brassage (miroir de `Measurement`). */
export const measurementSchema = z.object({
  kind: measurementKindSchema,
  value: z.number().finite(),
  at: epochMs,
  stepId: z.string().min(1),
  source: measurementSourceSchema,
});

/** Timer de palier armé (miroir de `TimerState`). */
export const timerStateSchema = z.object({
  stepId: z.string().min(1),
  startedAt: epochMs,
  plannedHoldMin: z.number().nonnegative(),
});

/** État complet du Jour J — instantané sérialisable (miroir de `DayState`). */
export const dayStateSchema = z.object({
  plan: dayPlanSchema,
  cursor: z.number().int().nonnegative(),
  status: stepStatusSchema,
  stepStartedAt: epochMs.nullable(),
  stabilizedAt: epochMs.nullable(),
  timer: timerStateSchema.nullable(),
  measurements: z.array(measurementSchema),
  completedStepIds: z.array(z.string().min(1)),
});

export type DayPlanInput = z.infer<typeof dayPlanSchema>;
export type DayStateInput = z.infer<typeof dayStateSchema>;
