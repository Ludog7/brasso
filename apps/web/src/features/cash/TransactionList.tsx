/**
 * Tableau des transactions externes (M7-09) — **lecture seule** (ADR-09) : date,
 * nature, montant (€), moyen de paiement, produit externe et statut de rapprochement
 * (`TransactionStatusBadge`). Aucune action d'écriture sur une transaction (append-only).
 */

import type { ExternalTransaction } from "@/lib/api";

import { TRANSACTION_KIND_LABELS } from "./labels";
import { TransactionStatusBadge } from "./TransactionStatusBadge";

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function TransactionList({ transactions }: { transactions: ExternalTransaction[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Nature</th>
            <th className="py-2 pr-4 font-medium">Montant</th>
            <th className="py-2 pr-4 font-medium">Paiement</th>
            <th className="py-2 pr-4 font-medium">Produit externe</th>
            <th className="py-2 font-medium">Statut</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-t border-border align-middle">
              <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                {dateTimeFmt.format(new Date(tx.occurredAt))}
              </td>
              <td className="py-3 pr-4 text-foreground">{TRANSACTION_KIND_LABELS[tx.kind]}</td>
              <td className="py-3 pr-4 tabular-nums text-foreground">
                {eurFmt.format(tx.amountCents / 100)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{tx.paymentMethod ?? "—"}</td>
              <td className="py-3 pr-4 text-muted-foreground">{tx.externalProductId ?? "—"}</td>
              <td className="py-3">
                <TransactionStatusBadge status={tx.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
