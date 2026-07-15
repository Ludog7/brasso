/**
 * Inventaire périodique (M5-07) : saisir la quantité **comptée** par article et
 * voir l'**écart** (compté − niveau courant) avant validation. À l'envoi, l'API
 * génère un mouvement d'ajustement `INVENTORY` par écart ; la liste se rafraîchit.
 * Seules les lignes réellement comptées (champ rempli) sont envoyées.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import type { InventoryCountInput, StockItem } from "@/lib/api";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Input } from "@/ui/input";

import { useApplyInventory } from "./hooks";
import { UNIT_LABELS } from "./labels";
import { useStockToasts } from "./toast";

const qtyFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function InventoryPanel({ items, onClose }: { items: StockItem[]; onClose: () => void }) {
  const apply = useApplyInventory();
  const pushToast = useStockToasts((s) => s.push);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const parsed = (id: string): number | null => {
    const raw = counts[id]?.trim();
    if (!raw) return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const payload: InventoryCountInput[] = items
    .map((i) => ({ id: i.id, counted: parsed(i.id) }))
    .filter((r): r is { id: string; counted: number } => r.counted !== null)
    .map((r) => ({ catalogItemId: r.id, countedQuantity: r.counted }));

  const submit = (): void => {
    if (payload.length === 0) return;
    apply.mutate(payload, {
      onSuccess: (lines) => {
        const adjusted = lines.filter((l) => l.delta !== 0).length;
        pushToast(
          adjusted === 0
            ? "Inventaire validé : aucun écart."
            : `Inventaire validé : ${adjusted} article(s) recalé(s).`,
        );
        setCounts({});
        onClose();
      },
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inventaire périodique</h2>
          <span className="text-sm text-muted-foreground">
            Saisissez la quantité comptée ; l'écart est calculé.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Article</th>
                <th className="py-2 pr-4 font-medium">Niveau</th>
                <th className="py-2 pr-4 font-medium">Compté</th>
                <th className="py-2 font-medium">Écart</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const counted = parsed(item.id);
                const delta = counted === null ? null : counted - item.level;
                const unit = UNIT_LABELS[item.unit];
                return (
                  <tr key={item.id} className="border-t border-border">
                    <td className="py-2 pr-4">{item.name}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {qtyFmt.format(item.level)} {unit}
                    </td>
                    <td className="py-2 pr-4">
                      <Input
                        aria-label={`Quantité comptée — ${item.name}`}
                        inputMode="decimal"
                        value={counts[item.id] ?? ""}
                        onChange={(e) => setCounts((c) => ({ ...c, [item.id]: e.target.value }))}
                        className="h-11 w-28"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 tabular-nums">
                      {delta === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={delta === 0 ? "text-muted-foreground" : "text-foreground"}>
                          {delta > 0 ? "+" : ""}
                          {qtyFmt.format(delta)} {unit}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {apply.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Inventaire non enregistré. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={apply.isPending}>
            Annuler
          </Button>
          <Button type="button" onClick={submit} disabled={apply.isPending || payload.length === 0}>
            {apply.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Valider l'inventaire
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
