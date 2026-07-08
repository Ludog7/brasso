import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import type { CatalogItem } from "@/lib/api";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";

// Primitives génériques de l'éditeur de recette (introduites par le BEER, M2-06) —
// sans logique propre à un moteur, réutilisées telles quelles.
import { CatalogPicker } from "../beer/CatalogPicker";
import { RowField } from "../beer/RowField";
import {
  type AdjunctRow,
  type AltFormState,
  emptyAdjunct,
  emptySugar,
  emptyYeast,
  type SugarRow,
  type YeastRow,
} from "./mapToEngine";

type IngredientSlices = Pick<AltFormState, "sugars" | "yeasts" | "adjuncts">;

interface AltIngredientsEditorProps {
  state: IngredientSlices;
  disabled?: boolean;
  onChange: (patch: Partial<IngredientSlices>) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function update<T extends { key: string }>(list: T[], key: string, patch: Partial<T>): T[] {
  return list.map((row) => (row.key === key ? { ...row, ...patch } : row));
}
function without<T extends { key: string }>(list: T[], key: string): T[] {
  return list.filter((row) => row.key !== key);
}
function attrNum(attributes: unknown, key: string): string {
  if (attributes && typeof attributes === "object" && key in attributes) {
    const v = (attributes as Record<string, unknown>)[key];
    if (typeof v === "number") return String(v);
  }
  return "";
}

const numInput = "max-w-28";

// ── Coquilles génériques ─────────────────────────────────────────────────────

function Section({
  title,
  picker,
  onAdd,
  addLabel,
  empty,
  children,
}: {
  title: string;
  picker: ReactNode;
  onAdd: () => void;
  addLabel: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {picker}
          <Button type="button" variant="outline" onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function RowShell({
  onRemove,
  disabled,
  children,
}: {
  onRemove: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="flex flex-1 flex-wrap items-end gap-3">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Retirer"
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

// ── Éditeur ──────────────────────────────────────────────────────────────────

/**
 * Ingrédients pertinents pour ALT_FERMENTED (`ingredientCategoriesByEngine`) :
 * sucres, levure, adjuvants. Les adjuvants accueillent les intrants non standards
 * (jus, sirops maison, infusions). Pas de malt/houblon (IBU/EBC non calculés).
 */
export function AltIngredientsEditor({ state, disabled, onChange }: AltIngredientsEditorProps) {
  const { sugars, yeasts, adjuncts } = state;

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Sucres & extraits"
        addLabel="+ Sucre"
        empty="Aucun sucre."
        onAdd={() => onChange({ sugars: [...sugars, emptySugar()] })}
        picker={
          <CatalogPicker
            category="SUGAR"
            disabled={disabled}
            onPick={(item: CatalogItem) =>
              onChange({
                sugars: [...sugars, { ...emptySugar(), catalogItemId: item.id, name: item.name }],
              })
            }
          />
        }
      >
        {sugars.map((row: SugarRow) => (
          <RowShell
            key={row.key}
            disabled={disabled}
            onRemove={() => onChange({ sugars: without(sugars, row.key) })}
          >
            <RowField label="Sucre / extrait" className="min-w-40 flex-1">
              <Input
                value={row.name}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ sugars: update(sugars, row.key, { name: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Quantité (g)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                className={numInput}
                value={row.amountG}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ sugars: update(sugars, row.key, { amountG: e.target.value }) })
                }
              />
            </RowField>
          </RowShell>
        ))}
      </Section>

      <Section
        title="Levure"
        addLabel="+ Levure"
        empty="Aucune levure."
        onAdd={() => onChange({ yeasts: [...yeasts, emptyYeast()] })}
        picker={
          <CatalogPicker
            category="YEAST"
            disabled={disabled}
            onPick={(item) =>
              onChange({
                yeasts: [
                  ...yeasts,
                  {
                    ...emptyYeast(),
                    catalogItemId: item.id,
                    name: item.name,
                    attenuationPct: attrNum(item.attributes, "attenuationPct"),
                  },
                ],
              })
            }
          />
        }
      >
        {yeasts.map((row: YeastRow) => (
          <RowShell
            key={row.key}
            disabled={disabled}
            onRemove={() => onChange({ yeasts: without(yeasts, row.key) })}
          >
            <RowField label="Levure" className="min-w-40 flex-1">
              <Input
                value={row.name}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ yeasts: update(yeasts, row.key, { name: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Atténuation (%)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                className={numInput}
                value={row.attenuationPct}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ yeasts: update(yeasts, row.key, { attenuationPct: e.target.value }) })
                }
              />
            </RowField>
          </RowShell>
        ))}
      </Section>

      <Section
        title="Adjuvants (jus, sirops, infusions…)"
        addLabel="+ Adjuvant"
        empty="Aucun adjuvant."
        onAdd={() => onChange({ adjuncts: [...adjuncts, emptyAdjunct()] })}
        picker={
          <CatalogPicker
            category="ADJUNCT"
            disabled={disabled}
            onPick={(item) =>
              onChange({
                adjuncts: [
                  ...adjuncts,
                  { ...emptyAdjunct(), catalogItemId: item.id, name: item.name },
                ],
              })
            }
          />
        }
      >
        {adjuncts.map((row: AdjunctRow) => (
          <RowShell
            key={row.key}
            disabled={disabled}
            onRemove={() => onChange({ adjuncts: without(adjuncts, row.key) })}
          >
            <RowField label="Adjuvant" className="min-w-40 flex-1">
              <Input
                value={row.name}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ adjuncts: update(adjuncts, row.key, { name: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Quantité (g)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                className={numInput}
                value={row.amountG}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ adjuncts: update(adjuncts, row.key, { amountG: e.target.value }) })
                }
              />
            </RowField>
          </RowShell>
        ))}
      </Section>
    </div>
  );
}
