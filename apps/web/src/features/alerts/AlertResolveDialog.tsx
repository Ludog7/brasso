/**
 * Résolution d'une anomalie d'intégration (M7-10). Propose un **ajustement de stock
 * manuel optionnel** (`catalogItem`, `delta` non nul, note) pour compenser une vente
 * non identifiée : l'app n'est pas une caisse (ADR-09), l'ajustement est **à la main**
 * du bénévole. Sans ajustement, la résolution bascule simplement l'anomalie `RESOLVED`.
 */

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { IntegrationAlert } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { useCatalogItems, useResolveAlert } from "./hooks";
import { ALERT_TYPE_LABELS } from "./labels";

export function AlertResolveDialog({
  alert,
  onClose,
}: {
  alert: IntegrationAlert;
  onClose: () => void;
}) {
  const resolve = useResolveAlert();
  const [withAdjustment, setWithAdjustment] = useState(false);
  const catalogItems = useCatalogItems(withAdjustment);

  const [catalogItemId, setCatalogItemId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent): void => {
    e.preventDefault();

    if (!withAdjustment) {
      setError(null);
      resolve.mutate({ id: alert.id }, { onSuccess: onClose });
      return;
    }

    const parsedDelta = Number(delta.replace(",", "."));
    if (catalogItemId === "") {
      setError("Sélectionnez l'article à ajuster.");
      return;
    }
    if (!Number.isFinite(parsedDelta) || parsedDelta === 0) {
      setError("La quantité d'ajustement doit être un nombre non nul.");
      return;
    }
    setError(null);
    resolve.mutate(
      {
        id: alert.id,
        stockAdjustment: {
          catalogItemId,
          delta: parsedDelta,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <DialogShell title="Résoudre l'anomalie" onClose={onClose} busy={resolve.isPending}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="font-medium text-foreground">{ALERT_TYPE_LABELS[alert.type]}</p>
          <p className="text-muted-foreground">{alert.message}</p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={withAdjustment}
            onChange={(e) => setWithAdjustment(e.target.checked)}
          />
          Ajuster le stock manuellement
        </label>

        {withAdjustment ? (
          <>
            <p className="text-xs text-muted-foreground">
              L'ajustement est <strong>manuel</strong> : l'application n'est pas une caisse
              (ADR-09). Renseignez une quantité négative pour décompter une vente non identifiée.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-item">Article</Label>
              <Select
                id="adjust-item"
                value={catalogItemId}
                onChange={(e) => setCatalogItemId(e.target.value)}
              >
                <option value="">Sélectionner…</option>
                {(catalogItems.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adjust-delta">Quantité (delta)</Label>
                <Input
                  id="adjust-delta"
                  type="number"
                  inputMode="numeric"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="-1"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adjust-note">Note</Label>
                <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {resolve.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Résolution impossible. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={resolve.isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={resolve.isPending}>
            {resolve.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Résoudre
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
