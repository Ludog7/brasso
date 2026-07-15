import { RESERVATION_STATUS_LABELS, RESERVATION_STATUS_TONE } from "@/features/batches/labels";
import type { BatchReservation } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

const qtyFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/**
 * Panneau « Déduction de stock » de la fiche batch (M5-08). Rend observable le
 * critère de démo M5 : les réservations passent de **réservé** (planifié, posé à la
 * planification) à **déduit** (consommé à l'ensemencement, ajusté au volume réel).
 * Lecture seule ; les quantités affichées sont celles réservées à la planification.
 */
export function StockDeductionPanel({
  reservations,
  names,
}: {
  reservations: BatchReservation[];
  names: Map<string, string>;
}) {
  // On ignore les réservations libérées (annulation) : sans intérêt pour la déduction.
  const lines = reservations.filter((r) => r.status !== "RELEASED");
  const consumed = lines.some((r) => r.status === "CONSUMED");
  const reserved = lines.some((r) => r.status === "RESERVED");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Déduction de stock</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune réservation de stock.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {consumed
                ? "Stock déduit à l'ensemencement — quantités consommées ajustées au volume réel."
                : reserved
                  ? "Stock réservé à la planification, pas encore déduit."
                  : "Réservations de stock du batch."}
            </p>
            <ul className="flex flex-col gap-2">
              {lines.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span>{names.get(r.catalogItemId) ?? r.catalogItemId}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{qtyFmt.format(r.quantity)}</span>
                    <Badge tone={RESERVATION_STATUS_TONE[r.status]}>
                      {RESERVATION_STATUS_LABELS[r.status]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
