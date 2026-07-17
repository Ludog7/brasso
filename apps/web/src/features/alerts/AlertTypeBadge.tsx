/**
 * Badge de type d'anomalie d'intégration (M7-10) : `UNMAPPED_TRANSACTION` (vente non
 * rapprochée) vs `WEBHOOK_FAILURE` (échec d'ingestion post-signature).
 */

import type { IntegrationAlertType } from "@/lib/api";
import { Badge } from "@/ui/badge";

import { ALERT_TYPE_LABELS, ALERT_TYPE_TONE } from "./labels";

export function AlertTypeBadge({ type }: { type: IntegrationAlertType }) {
  return <Badge tone={ALERT_TYPE_TONE[type]}>{ALERT_TYPE_LABELS[type]}</Badge>;
}
