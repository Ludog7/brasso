import type { BatchMilestoneKind, BatchStatus, MeasureType, ReservationStatus } from "@/lib/api";
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

/** Libellés des jalons du cycle post-ensemencement (M9). */
export const MILESTONE_LABELS: Record<BatchMilestoneKind, string> = {
  FERMENTATION: "Fermentation",
  DRY_HOP: "Dry hop",
  COLD_CRASH: "Cold crash",
  GARDE: "Garde",
};

/**
 * Urgence d'une échéance, pour la mettre en évidence dans la liste (M9-10 §A).
 * C'est l'information qui déclenche une action à l'atelier.
 */
export type DeadlineUrgency = "overdue" | "soon" | "later";

/** En deçà de ce délai, une échéance est « proche » et mérite d'être signalée. */
export const DEADLINE_SOON_DAYS = 3;

export const DEADLINE_TONE: Record<DeadlineUrgency, NonNullable<BadgeProps["tone"]>> = {
  overdue: "destructive",
  soon: "warning",
  later: "muted",
};

/**
 * Mention textuelle de l'urgence. **Doublonner la couleur par du texte** est
 * délibéré : la couleur seule ne suffit pas (accessibilité AA, §6), et l'écran
 * se lit à distance, sur une tablette d'atelier parfois éclairée de travers.
 */
export const DEADLINE_LABELS: Record<DeadlineUrgency, string> = {
  overdue: "En retard",
  soon: "Imminent",
  later: "À venir",
};

/**
 * Situe une échéance par rapport à aujourd'hui. Comparaison en **jours
 * calendaires** dans le fuseau du navigateur : une échéance « demain » reste
 * demain quelle que soit l'heure qu'il est, alors qu'une différence en
 * millisecondes basculerait selon le moment de la consultation.
 *
 * @param deadlineDate date calendaire `YYYY-MM-DD` renvoyée par l'API
 */
export function deadlineUrgency(deadlineDate: string, today = new Date()): DeadlineUrgency {
  const [year, month, day] = deadlineDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return "later";
  const deadline = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((deadline - now) / 86_400_000);
  if (days < 0) return "overdue";
  return days <= DEADLINE_SOON_DAYS ? "soon" : "later";
}

/** Libellés des étapes retenues dans le plan de fermentation. */
export const FERMENTATION_STEP_LABELS: Record<string, string> = {
  FERMENT: "Fermentation",
  STABILIZE: "Stabilisation",
  CONDITION: "Garde / conditionnement",
};
