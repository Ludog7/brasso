import { type ProcessStepType, stepTypesByEngine } from "@brasso/core";
import { Trash2 } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Select } from "@/ui/select";

import { RowField } from "../beer/RowField";
import { emptyStep, type SoftStepRow } from "./mapToEngine";

const SOFT_STEP_TYPES = stepTypesByEngine.SOFT_DRINK;

const STEP_LABELS: Record<ProcessStepType, string> = {
  MASH: "Empâtage",
  MASH_STEP: "Palier d'empâtage",
  SPARGE: "Rinçage",
  BOIL: "Chauffe / macération",
  WHIRLPOOL: "Whirlpool",
  COOL: "Refroidissement",
  FERMENT: "Fermentation",
  STABILIZE: "Stabilisation",
  CONDITION: "Garde",
  PACKAGE: "Conditionnement",
  OTHER: "Autre",
};

/** Quels champs afficher selon le type d'étape (aligné sur `stepParams`, SOFT). */
function fieldsFor(type: ProcessStepType): { temp: boolean; time: boolean } {
  switch (type) {
    case "BOIL":
      return { temp: false, time: true };
    case "COOL":
    case "STABILIZE":
      return { temp: true, time: false };
    default:
      return { temp: false, time: false };
  }
}

interface SoftStepsEditorProps {
  steps: SoftStepRow[];
  disabled?: boolean;
  onChange: (steps: SoftStepRow[]) => void;
}

export function SoftStepsEditor({ steps, disabled, onChange }: SoftStepsEditorProps) {
  const update = (key: string, patch: Partial<SoftStepRow>) =>
    onChange(steps.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: string) => onChange(steps.filter((row) => row.key !== key));

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">Process</CardTitle>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...steps, emptyStep("BOIL")])}
        >
          + Étape
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune étape. Ajoute chauffe/macération, refroidissement, stabilisation…
          </p>
        ) : (
          steps.map((row) => {
            const show = fieldsFor(row.type);
            return (
              <div
                key={row.key}
                className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
              >
                <div className="flex flex-1 flex-wrap items-end gap-3">
                  <RowField label="Type" className="min-w-44">
                    <Select
                      value={row.type}
                      disabled={disabled}
                      onChange={(e) => update(row.key, { type: e.target.value as ProcessStepType })}
                    >
                      {SOFT_STEP_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {STEP_LABELS[type]}
                        </option>
                      ))}
                    </Select>
                  </RowField>
                  <RowField label="Libellé" className="min-w-40 flex-1">
                    <Input
                      value={row.name}
                      disabled={disabled}
                      placeholder="optionnel"
                      onChange={(e) => update(row.key, { name: e.target.value })}
                    />
                  </RowField>
                  {show.temp ? (
                    <RowField label="Température (°C)">
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="max-w-28"
                        value={row.tempC}
                        disabled={disabled}
                        onChange={(e) => update(row.key, { tempC: e.target.value })}
                      />
                    </RowField>
                  ) : null}
                  {show.time ? (
                    <RowField label="Durée (min)">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        className="max-w-28"
                        value={row.timeMin}
                        disabled={disabled}
                        onChange={(e) => update(row.key, { timeMin: e.target.value })}
                      />
                    </RowField>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => remove(row.key)}
                  aria-label="Retirer l'étape"
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
