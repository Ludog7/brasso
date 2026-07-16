/**
 * Création / édition d'un article de catalogue (M5-07). Le `kind` est **verrouillé
 * en édition** (intégrité de la logique de stock, cohérent API). Le coût de
 * référence est saisi en **euros** et converti en **centimes** (unité interne)
 * avant envoi. Un article `RECETTE` porte une catégorie d'ingrédient.
 */

import type { CatalogKind, IngredientCategory, StockUnit } from "@brasso/core";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { StockItem } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { useCreateItem, useUpdateItem } from "./hooks";
import { CATEGORY_LABELS, KIND_LABELS, UNIT_LABELS } from "./labels";

const KINDS: CatalogKind[] = ["RECETTE", "BULK", "CONDITIONNEMENT"];
const UNITS: StockUnit[] = ["GRAM", "LITER", "UNIT"];
const CATEGORIES: IngredientCategory[] = ["MALT", "SUGAR", "HOP", "YEAST", "ADJUNCT"];

/** Euros (chaîne de saisie) → centimes entiers ; `undefined` si vide. */
function eurosToCents(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return Math.round(Number(trimmed.replace(",", ".")) * 100);
}

/** Centimes → euros (chaîne d'affichage éditable), `""` si absent. */
function centsToEuros(cents: number | null): string {
  return cents == null ? "" : String(cents / 100);
}

export function ItemFormDialog({ item, onClose }: { item?: StockItem; onClose: () => void }) {
  const editing = item !== undefined;
  const create = useCreateItem();
  const update = useUpdateItem(item?.id ?? "");
  const mutation = editing ? update : create;

  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<CatalogKind>(item?.kind ?? "RECETTE");
  const [category, setCategory] = useState<IngredientCategory>(
    (item?.category as IngredientCategory | null) ?? "MALT",
  );
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? "GRAM");
  const [costEuros, setCostEuros] = useState(centsToEuros(item?.defaultUnitCostCents ?? null));
  const [threshold, setThreshold] = useState(
    item?.reorderThreshold == null ? "" : String(item.reorderThreshold),
  );
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === "") {
      setError("Le nom est obligatoire.");
      return;
    }
    setError(null);
    const defaultUnitCostCents = eurosToCents(costEuros);
    const reorderThreshold = threshold.trim() === "" ? undefined : Number(threshold);
    const category_ = kind === "RECETTE" ? category : undefined;

    if (editing) {
      update.mutate(
        {
          name: name.trim(),
          unit,
          isActive,
          defaultUnitCostCents,
          reorderThreshold,
          category: category_,
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          kind,
          unit,
          isActive,
          defaultUnitCostCents,
          reorderThreshold,
          category: category_,
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <DialogShell
      title={editing ? "Modifier l'article" : "Nouvel article"}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-name">Nom</Label>
          <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-kind">Type</Label>
          <Select
            id="item-kind"
            value={kind}
            disabled={editing}
            onChange={(e) => setKind(e.target.value as CatalogKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          {editing ? (
            <p className="text-xs text-muted-foreground">Le type n'est pas modifiable.</p>
          ) : null}
        </div>

        {kind === "RECETTE" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-category">Catégorie</Label>
            <Select
              id="item-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as IngredientCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-unit">Unité</Label>
            <Select
              id="item-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as StockUnit)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-cost">Coût de référence (€)</Label>
            <Input
              id="item-cost"
              inputMode="decimal"
              value={costEuros}
              onChange={(e) => setCostEuros(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="item-threshold">Seuil de réappro ({UNIT_LABELS[unit]})</Label>
          <Input
            id="item-threshold"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="Aucune alerte si vide"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-5"
          />
          Article actif
        </label>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Enregistrement impossible. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            {editing ? "Enregistrer" : "Créer l'article"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
