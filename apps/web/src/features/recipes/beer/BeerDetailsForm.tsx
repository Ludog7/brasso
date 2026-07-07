import type { BjcpStyle } from "@brasso/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";
import { Textarea } from "@/ui/textarea";

import type { BeerFormState } from "./mapToEngine";

/** Champs scalaires de détail pilotés par ce formulaire. */
export type BeerDetailsFields = Pick<
  BeerFormState,
  "name" | "description" | "styleCode" | "batchVolumeL" | "boilTimeMin" | "efficiencyPct"
>;

interface BeerDetailsFormProps {
  fields: BeerDetailsFields;
  styles: BjcpStyle[];
  stylesLoading: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<BeerDetailsFields>) => void;
}

export function BeerDetailsForm({
  fields,
  styles,
  stylesLoading,
  disabled,
  onChange,
}: BeerDetailsFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Détails</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="beer-name">Nom</Label>
          <Input
            id="beer-name"
            value={fields.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="beer-description">Description</Label>
          <Textarea
            id="beer-description"
            value={fields.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={disabled}
            placeholder="Intentions, inspiration, notes…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="beer-style">Style BJCP</Label>
          <Select
            id="beer-style"
            value={fields.styleCode}
            onChange={(e) => onChange({ styleCode: e.target.value })}
            disabled={disabled || stylesLoading}
          >
            <option value="">Aucun style</option>
            {styles.map((style) => (
              <option key={style.code} value={style.code}>
                {style.code} — {style.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="beer-volume">Volume cible (L)</Label>
            <Input
              id="beer-volume"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={fields.batchVolumeL}
              onChange={(e) => onChange({ batchVolumeL: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="beer-boil">Ébullition (min)</Label>
            <Input
              id="beer-boil"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={fields.boilTimeMin}
              onChange={(e) => onChange({ boilTimeMin: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="beer-efficiency">Efficacité (%)</Label>
            <Input
              id="beer-efficiency"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="1"
              value={fields.efficiencyPct}
              onChange={(e) => onChange({ efficiencyPct: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
