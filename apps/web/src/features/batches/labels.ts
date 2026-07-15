import type { BatchStatus, MeasureType, ReservationStatus } from "@/lib/api";
import type { BadgeProps } from "@/ui/badge";

export const STATUS_LABELS: Record<BatchStatus, string> = {
  PLANIFIE: "Planifié",
  EN_BRASSAGE: "En brassage",
  EN_FERMENTATION: "En fermentation",
  EN_CONDITIONNEMENT: "En conditionnement",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

export const STATUS_TONE: Record<BatchStatus, NonNullable<BadgeProps["tone"]>> = {
  PLANIFIE: "accent",
  EN_BRASSAGE: "accent",
  EN_FERMENTATION: "accent",
  EN_CONDITIONNEMENT: "accent",
  TERMINE: "success",
  ANNULE: "muted",
};

export const MEASURE_TYPE_LABELS: Record<MeasureType, string> = {
  GRAVITY: "Densité",
  TEMPERATURE: "Température",
  PH: "pH",
  VOLUME: "Volume",
  OTHER: "Autre",
};

/** Unité par défaut proposée dans le formulaire de mesure (éditable). */
export const MEASURE_DEFAULT_UNIT: Record<MeasureType, string> = {
  GRAVITY: "SG",
  TEMPERATURE: "°C",
  PH: "",
  VOLUME: "L",
  OTHER: "",
};

export const MEASURE_TYPES: MeasureType[] = ["GRAVITY", "TEMPERATURE", "PH", "VOLUME", "OTHER"];

/** Statut d'une réservation de stock (M5-08) : réservé (planifié) → déduit (consommé). */
export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  RESERVED: "Réservé",
  CONSUMED: "Déduit",
  RELEASED: "Libéré",
};

/** Ton de badge : seul `CONSUMED` (déduit) est « vert » ; réservé = neutre en attente. */
export const RESERVATION_STATUS_TONE: Record<ReservationStatus, NonNullable<BadgeProps["tone"]>> = {
  RESERVED: "accent",
  CONSUMED: "success",
  RELEASED: "muted",
};

/** Libellés des étapes retenues dans le plan de fermentation. */
export const FERMENTATION_STEP_LABELS: Record<string, string> = {
  FERMENT: "Fermentation",
  STABILIZE: "Stabilisation",
  CONDITION: "Garde / conditionnement",
};
