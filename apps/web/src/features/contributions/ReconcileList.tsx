/**
 * Liste des cotisations `MEMBERSHIP` **à rapprocher** (M6-10). Montant, date,
 * référence native (`externalId`) et moyen de paiement — l'email du payeur n'est
 * pas exposé par l'API (payload brut jamais renvoyé, ADR-09). Le bouton
 * « Rapprocher » n'est rendu qu'aux rôles habilités (`membres:update`).
 */

import type { Contribution } from "@/lib/api";
import { Button } from "@/ui/button";

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export function ReconcileList({
  contributions,
  canReconcile,
  onReconcile,
}: {
  contributions: Contribution[];
  canReconcile: boolean;
  onReconcile: (contribution: Contribution) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Montant</th>
            <th className="py-2 pr-4 font-medium">Référence</th>
            <th className="py-2 pr-4 font-medium">Paiement</th>
            {canReconcile ? <th className="py-2 font-medium sr-only">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {contributions.map((contribution) => (
            <tr key={contribution.id} className="border-t border-border align-middle">
              <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-muted-foreground">
                {dateFmt.format(new Date(contribution.occurredAt))}
              </td>
              <td className="py-3 pr-4 tabular-nums font-medium">
                {eurFmt.format(contribution.amountCents / 100)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{contribution.externalId}</td>
              <td className="py-3 pr-4 text-muted-foreground">
                {contribution.paymentMethod ?? "—"}
              </td>
              {canReconcile ? (
                <td className="py-3">
                  <Button variant="outline" onClick={() => onReconcile(contribution)}>
                    Rapprocher
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
