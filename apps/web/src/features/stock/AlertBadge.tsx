import { AlertTriangle } from "lucide-react";

import { Badge } from "@/ui/badge";

/** Badge « Stock bas » d'un article sous son seuil de réappro (M5-07). */
export function AlertBadge() {
  return (
    <Badge tone="warning" className="gap-1">
      <AlertTriangle className="size-3.5" aria-hidden="true" />
      Stock bas
    </Badge>
  );
}
