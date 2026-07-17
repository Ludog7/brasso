/**
 * Tableau des anomalies d'intégration (M7-10) : type (`AlertTypeBadge`), message,
 * fournisseur, contexte de la transaction liée (montant/date/produit externe),
 * statut et date. Le bouton « Résoudre » n'est rendu que pour une anomalie `OPEN`
 * quand `canResolve` (RBAC UI ; l'API reste l'autorité).
 */

import type { IntegrationAlert } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { AlertTypeBadge } from "./AlertTypeBadge";
import { ALERT_STATUS_LABELS, ALERT_STATUS_TONE } from "./labels";

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function AlertList({
  alerts,
  canResolve,
  onResolve,
  resolvingId,
}: {
  alerts: IntegrationAlert[];
  canResolve: boolean;
  onResolve: (alert: IntegrationAlert) => void;
  /** Id de l'anomalie en cours de résolution (bouton désactivé). */
  resolvingId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Détail</th>
            <th className="py-2 pr-4 font-medium">Transaction</th>
            <th className="py-2 pr-4 font-medium">Statut</th>
            <th className="py-2 font-medium sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} className="border-t border-border align-top">
              <td className="py-3 pr-4">
                <AlertTypeBadge type={alert.type} />
              </td>
              <td className="py-3 pr-4">
                <span className="text-foreground">{alert.message}</span>
                <span className="block text-xs text-muted-foreground">
                  {alert.provider?.label ?? alert.providerId ?? "—"} ·{" "}
                  {dateFmt.format(new Date(alert.createdAt))}
                </span>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {alert.transaction ? (
                  <>
                    <span className="tabular-nums text-foreground">
                      {eurFmt.format(alert.transaction.amountCents / 100)}
                    </span>
                    <span className="block text-xs">
                      {alert.transaction.externalProductId ?? "—"} ·{" "}
                      {dateFmt.format(new Date(alert.transaction.occurredAt))}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-3 pr-4">
                <Badge tone={ALERT_STATUS_TONE[alert.status]}>
                  {ALERT_STATUS_LABELS[alert.status]}
                </Badge>
              </td>
              <td className="py-3">
                {canResolve && alert.status === "OPEN" ? (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => onResolve(alert)}
                      disabled={resolvingId === alert.id}
                    >
                      Résoudre
                    </Button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
