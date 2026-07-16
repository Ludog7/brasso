/**
 * Badge de statut de cotisation (M6-09) : `A_JOUR` = vert, `EN_RETARD` = ambre.
 * Le statut est **dérivé** côté serveur (période × dernière cotisation).
 */

import type { MembershipStatus } from "@brasso/core";

import { Badge } from "@/ui/badge";

import { MEMBERSHIP_LABELS } from "./labels";

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  return (
    <Badge tone={status === "A_JOUR" ? "success" : "warning"}>{MEMBERSHIP_LABELS[status]}</Badge>
  );
}
