/**
 * Éditeur de la sélection de produits d'un écran (M7-12). L'API #181 n'expose pas la
 * lecture brute des items (seul le rendu filtré au stock) : l'éditeur **compose une
 * nouvelle sélection** qui **remplace** l'existante (`PUT items`). Chaque produit porte
 * ses indicateurs (nouveau/coup de cœur/brassin spécial), un prix affiché optionnel et
 * un ordre réglé par **boutons monter/descendre** (zéro drag-and-drop — atelier §6).
 */

import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";

import type { CatalogItem, DisplayItemInput, DisplayScreen } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { useCatalogItems, useSetItems } from "./hooks";
import { ITEM_FLAGS } from "./labels";

interface EditorRow {
  catalogItemId: string;
  name: string;
  isNew: boolean;
  isFavorite: boolean;
  isSpecial: boolean;
  /** Prix affiché en euros (saisie) ; converti en centimes à l'enregistrement. */
  price: string;
}

export function ScreenItemsEditor({
  screen,
  onClose,
}: {
  screen: DisplayScreen;
  onClose: () => void;
}) {
  const catalogItems = useCatalogItems();
  const setItems = useSetItems(screen.id);
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [toAdd, setToAdd] = useState("");

  const available: CatalogItem[] = (catalogItems.data ?? []).filter(
    (item) => !rows.some((r) => r.catalogItemId === item.id),
  );

  const addProduct = (): void => {
    const item = (catalogItems.data ?? []).find((i) => i.id === toAdd);
    if (!item) return;
    setRows((prev) => [
      ...prev,
      {
        catalogItemId: item.id,
        name: item.name,
        isNew: false,
        isFavorite: false,
        isSpecial: false,
        price: "",
      },
    ]);
    setToAdd("");
  };

  const patchRow = (index: number, patch: Partial<EditorRow>): void => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number): void => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1): void => {
    setRows((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const save = (): void => {
    const items: DisplayItemInput[] = rows.map((r, i) => ({
      catalogItemId: r.catalogItemId,
      isNew: r.isNew,
      isFavorite: r.isFavorite,
      isSpecial: r.isSpecial,
      priceCents: r.price.trim() ? Math.round(Number(r.price.replace(",", ".")) * 100) : null,
      sortOrder: i,
    }));
    setItems.mutate(items, { onSuccess: onClose });
  };

  return (
    <DialogShell
      title={`Produits de l'écran « ${screen.name} »`}
      description="La sélection remplace entièrement l'affichage de l'écran."
      onClose={onClose}
      busy={setItems.isPending}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="items-add">Ajouter un produit</Label>
            <Select id="items-add" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
              <option value="">Sélectionner…</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={addProduct} disabled={toAdd === ""}>
            <Plus className="size-5" aria-hidden="true" />
            Ajouter
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun produit sélectionné.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li
                key={row.catalogItemId}
                className="flex flex-col gap-2 rounded-md border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{row.name}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Monter ${row.name}`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Descendre ${row.name}`}
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                    >
                      <ArrowDown className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Retirer ${row.name}`}
                      onClick={() => removeRow(index)}
                    >
                      <X className="size-5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {ITEM_FLAGS.map((flag) => (
                    <label key={flag.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={row[flag.key]}
                        onChange={(e) => patchRow(index, { [flag.key]: e.target.checked })}
                      />
                      {flag.label}
                    </label>
                  ))}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`price-${row.catalogItemId}`}>Prix affiché (€)</Label>
                  <Input
                    id={`price-${row.catalogItemId}`}
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) => patchRow(index, { price: e.target.value })}
                    placeholder="4,50"
                    className="max-w-32"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {setItems.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Enregistrement impossible. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={setItems.isPending}>
            Annuler
          </Button>
          <Button type="button" onClick={save} disabled={setItems.isPending}>
            {setItems.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Enregistrer la sélection
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
