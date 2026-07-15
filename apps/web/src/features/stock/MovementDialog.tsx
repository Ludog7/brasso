/**
 * Saisie d'un mouvement de stock **manuel** (M5-07) : achat, ajustement, perte,
 * retour… `PRODUCTION`/`SALE` sont **absents** du menu (réservés à la déduction
 * batch et au hub caisse). La quantité est saisie positive ; le **sens** (entrée
 * +/ sortie −) donne le signe du `delta`. Succès → invalidation de la liste + toast.
 */

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { ManualMovementReason, StockItem } from "@/lib/api";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";
import { Textarea } from "@/ui/textarea";

import { DialogShell } from "./DialogShell";
import { useCreateMovement } from "./hooks";
import { MOVEMENT_REASON_LABELS, MOVEMENT_REASONS, UNIT_LABELS } from "./labels";
import { useStockToasts } from "./toast";

export function MovementDialog({
  items,
  defaultItemId,
  onClose,
}: {
  items: StockItem[];
  defaultItemId?: string;
  onClose: () => void;
}) {
  const movement = useCreateMovement();
  const pushToast = useStockToasts((s) => s.push);
  const [itemId, setItemId] = useState(defaultItemId ?? items[0]?.id ?? "");
  const [reason, setReason] = useState<ManualMovementReason>("PURCHASE");
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = items.find((i) => i.id === itemId);
  const unit = selected ? UNIT_LABELS[selected.unit] : "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity.replace(",", "."));
    if (!itemId) {
      setError("Sélectionnez un article.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La quantité doit être un nombre strictement positif.");
      return;
    }
    setError(null);
    const delta = direction === "out" ? -qty : qty;
    movement.mutate(
      { catalogItemId: itemId, delta, reason, note: note.trim() || undefined },
      {
        onSuccess: () => {
          pushToast(`Mouvement enregistré (${direction === "out" ? "−" : "+"}${qty} ${unit}).`);
          onClose();
        },
      },
    );
  };

  return (
    <DialogShell title="Nouveau mouvement" onClose={onClose} busy={movement.isPending}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mv-item">Article</Label>
          <Select id="mv-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mv-reason">Motif</Label>
            <Select
              id="mv-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as ManualMovementReason)}
            >
              {MOVEMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {MOVEMENT_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mv-direction">Sens</Label>
            <Select
              id="mv-direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
            >
              <option value="in">Entrée (+)</option>
              <option value="out">Sortie (−)</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mv-qty">Quantité ({unit})</Label>
          <Input
            id="mv-qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mv-note">Note (optionnelle)</Label>
          <Textarea
            id="mv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. purge CO₂, casse en cave…"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {movement.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Enregistrement impossible. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={movement.isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={movement.isPending}>
            {movement.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Enregistrer
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
