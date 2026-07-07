import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import type { CatalogItem } from "@/lib/api";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Select } from "@/ui/select";

import { CatalogPicker } from "./CatalogPicker";
import {
  type AdjunctRow,
  type BeerFormState,
  emptyAdjunct,
  emptyHop,
  emptyMalt,
  emptySugar,
  emptyYeast,
  HOP_FORMS,
  HOP_USES,
  type HopRow,
  type MaltRow,
  type SugarRow,
  type YeastRow,
} from "./mapToEngine";
import { RowField } from "./RowField";

type IngredientSlices = Pick<BeerFormState, "malts" | "sugars" | "hops" | "yeasts" | "adjuncts">;

interface IngredientsEditorProps {
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
function attrForm(attributes: unknown): HopRow["form"] {
  if (attributes && typeof attributes === "object" && "form" in attributes) {
    const v = (attributes as Record<string, unknown>).form;
    const lower = typeof v === "string" ? v.toLowerCase() : "";
    return HOP_FORMS.find((f) => f === lower) ?? "";
  }
  return "";
}

const HOP_USE_LABELS: Record<(typeof HOP_USES)[number], string> = {
  BOIL: "Ébullition",
  FIRST_WORT: "First wort",
  WHIRLPOOL: "Whirlpool",
  DRY_HOP: "Dry hop",
};

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

const numInput = "max-w-28";

// ── Éditeur ──────────────────────────────────────────────────────────────────

export function IngredientsEditor({ state, disabled, onChange }: IngredientsEditorProps) {
  const { malts, sugars, hops, yeasts, adjuncts } = state;

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Malts & céréales"
        addLabel="+ Malt"
        empty="Aucun malt pour l'instant."
        onAdd={() => onChange({ malts: [...malts, emptyMalt()] })}
        picker={
          <CatalogPicker
            category="MALT"
            disabled={disabled}
            onPick={(item: CatalogItem) =>
              onChange({
                malts: [
                  ...malts,
                  {
                    ...emptyMalt(),
                    catalogItemId: item.id,
                    name: item.name,
                    colorEbc: attrNum(item.attributes, "colorEbc"),
                    potentialSg: attrNum(item.attributes, "potentialSg"),
                  },
                ],
              })
            }
          />
        }
      >
        {malts.map((row: MaltRow) => (
          <RowShell
            key={row.key}
            disabled={disabled}
            onRemove={() => onChange({ malts: without(malts, row.key) })}
          >
            <RowField label="Malt / céréale" className="min-w-40 flex-1">
              <Input
                value={row.name}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ malts: update(malts, row.key, { name: e.target.value }) })
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
                  onChange({ malts: update(malts, row.key, { amountG: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Couleur (EBC)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                className={numInput}
                value={row.colorEbc}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ malts: update(malts, row.key, { colorEbc: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Potentiel (SG)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.001"
                className={numInput}
                value={row.potentialSg}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ malts: update(malts, row.key, { potentialSg: e.target.value }) })
                }
              />
            </RowField>
          </RowShell>
        ))}
      </Section>

      <Section
        title="Sucres & extraits"
        addLabel="+ Sucre"
        empty="Aucun sucre."
        onAdd={() => onChange({ sugars: [...sugars, emptySugar()] })}
        picker={
          <CatalogPicker
            category="SUGAR"
            disabled={disabled}
            onPick={(item) =>
              onChange({
                sugars: [
                  ...sugars,
                  {
                    ...emptySugar(),
                    catalogItemId: item.id,
                    name: item.name,
                    potentialSg: attrNum(item.attributes, "potentialSg"),
                    colorEbc: attrNum(item.attributes, "colorEbc"),
                  },
                ],
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
            <RowField label="Quantité sucre (g)">
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
            <RowField label="Potentiel sucre (SG)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.001"
                className={numInput}
                value={row.potentialSg}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ sugars: update(sugars, row.key, { potentialSg: e.target.value }) })
                }
              />
            </RowField>
          </RowShell>
        ))}
      </Section>

      <Section
        title="Houblons"
        addLabel="+ Houblon"
        empty="Aucun houblon."
        onAdd={() => onChange({ hops: [...hops, emptyHop()] })}
        picker={
          <CatalogPicker
            category="HOP"
            disabled={disabled}
            onPick={(item) =>
              onChange({
                hops: [
                  ...hops,
                  {
                    ...emptyHop(),
                    catalogItemId: item.id,
                    name: item.name,
                    alphaPct: (() => {
                      const a = attrNum(item.attributes, "alphaAcid");
                      return a === "" ? "" : String(Number(a) * 100);
                    })(),
                    form: attrForm(item.attributes),
                  },
                ],
              })
            }
          />
        }
      >
        {hops.map((row: HopRow) => (
          <RowShell
            key={row.key}
            disabled={disabled}
            onRemove={() => onChange({ hops: without(hops, row.key) })}
          >
            <RowField label="Houblon" className="min-w-36 flex-1">
              <Input
                value={row.name}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ hops: update(hops, row.key, { name: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Masse (g)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                className={numInput}
                value={row.amountG}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ hops: update(hops, row.key, { amountG: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Alpha (%)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                className={numInput}
                value={row.alphaPct}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ hops: update(hops, row.key, { alphaPct: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Temps (min)">
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                className={numInput}
                value={row.timeMin}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ hops: update(hops, row.key, { timeMin: e.target.value }) })
                }
              />
            </RowField>
            <RowField label="Usage">
              <Select
                value={row.use}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    hops: update(hops, row.key, { use: e.target.value as HopRow["use"] }),
                  })
                }
              >
                {HOP_USES.map((use) => (
                  <option key={use} value={use}>
                    {HOP_USE_LABELS[use]}
                  </option>
                ))}
              </Select>
            </RowField>
            <RowField label="Forme">
              <Select
                value={row.form}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    hops: update(hops, row.key, { form: e.target.value as HopRow["form"] }),
                  })
                }
              >
                <option value="">—</option>
                {HOP_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </Select>
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
        title="Adjuvants"
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
            <RowField label="Quantité adjuvant (g)">
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
