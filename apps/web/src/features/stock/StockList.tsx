/**
 * Tableau du catalogue avec **niveaux dérivés** (M5-07). Wording différencié par
 * `kind` : un article `RECETTE` affiche le disponible **net des réservations** ;
 * `BULK`/`CONDITIONNEMENT` n'ont pas de réservation. Ligne sous le seuil → badge
 * « Stock bas ». Les actions d'écriture (Modifier) ne sont rendues qu'aux rôles
 * autorisés (`canWrite`).
 */

import { Pencil } from "lucide-react";

import type { StockItem } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { AlertBadge } from "./AlertBadge";
import { KIND_LABELS, UNIT_LABELS } from "./labels";

const qtyFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function cost(cents: number | null): string {
  return cents == null ? "—" : eurFmt.format(cents / 100);
}

export function StockList({
  items,
  canWrite,
  onEdit,
}: {
  items: StockItem[];
  canWrite: boolean;
  onEdit: (item: StockItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Article</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 pr-4 font-medium">Niveau</th>
            <th className="py-2 pr-4 font-medium">Réservé</th>
            <th className="py-2 pr-4 font-medium">Disponible</th>
            <th className="py-2 pr-4 font-medium">Coût réf.</th>
            {canWrite ? <th className="py-2 font-medium sr-only">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const unit = UNIT_LABELS[item.unit];
            const isRecette = item.kind === "RECETTE";
            return (
              <tr key={item.id} className="border-t border-border align-middle">
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {item.below ? <AlertBadge /> : null}
                    {!item.isActive ? <Badge tone="muted">Inactif</Badge> : null}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Badge tone="neutral">{KIND_LABELS[item.kind]}</Badge>
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  {qtyFmt.format(item.level)} {unit}
                </td>
                <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                  {isRecette ? `${qtyFmt.format(item.reservedOutstanding)} ${unit}` : "—"}
                </td>
                <td className="py-3 pr-4 tabular-nums">
                  {qtyFmt.format(item.available)} {unit}
                </td>
                <td className="py-3 pr-4 tabular-nums">{cost(item.defaultUnitCostCents)}</td>
                {canWrite ? (
                  <td className="py-3">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Modifier ${item.name}`}
                      onClick={() => onEdit(item)}
                    >
                      <Pencil className="size-5" aria-hidden="true" />
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
