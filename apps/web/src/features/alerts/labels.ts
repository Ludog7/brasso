/**
 * Libellés FR du dashboard des anomalies d'intégration (M7-10) : type d'anomalie et
 * statut. Ordres d'itération stables pour un rendu déterministe.
 */

import type { IntegrationAlertStatus, IntegrationAlertType } from "@/lib/api";
import type { BadgeProps } from "@/ui/badge";

export const ALERT_TYPE_LABELS: Record<IntegrationAlertType, string> = {
  UNMAPPED_TRANSACTION: "Vente non rapprochée",
  WEBHOOK_FAILURE: "Échec webhook",
};

/** Teinte du badge par type : vente non rapprochée = ambre (actionnable), échec = accent. */
export const ALERT_TYPE_TONE: Record<IntegrationAlertType, BadgeProps["tone"]> = {
  UNMAPPED_TRANSACTION: "warning",
  WEBHOOK_FAILURE: "accent",
};

export const ALERT_STATUS_LABELS: Record<IntegrationAlertStatus, string> = {
  OPEN: "Ouverte",
  RESOLVED: "Résolue",
};

export const ALERT_STATUS_TONE: Record<IntegrationAlertStatus, BadgeProps["tone"]> = {
  OPEN: "warning",
  RESOLVED: "success",
};
