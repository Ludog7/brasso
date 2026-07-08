import {
  type StabilizationMethod,
  stabilizationMethodSchema,
  type StorageMode,
  storageModeSchema,
} from "@brasso/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";
import { Textarea } from "@/ui/textarea";

import { STABILIZATION_LABELS, STORAGE_MODE_LABELS } from "../labels";
import type { SoftFormState } from "./mapToEngine";

/** Champs scalaires de détail pilotés par ce formulaire. */
export type SoftDetailsFields = Pick<
  SoftFormState,
  | "name"
  | "description"
  | "sugarConcentration"
  | "targetPh"
  | "storageMode"
  | "stabilizationMethod"
  | "batchVolumeL"
>;

interface SoftDetailsFormProps {
  fields: SoftDetailsFields;
  disabled?: boolean;
  onChange: (patch: Partial<SoftDetailsFields>) => void;
}

export function SoftDetailsForm({ fields, disabled, onChange }: SoftDetailsFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Détails</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="soft-name">Nom</Label>
          <Input
            id="soft-name"
            value={fields.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="soft-description">Description</Label>
          <Textarea
            id="soft-description"
            value={fields.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={disabled}
            placeholder="Notes qualitatives : aromatique, acidité, couleur…"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="soft-sugar">Concentration en sucre (g/L)</Label>
            <Input
              id="soft-sugar"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={fields.sugarConcentration}
              onChange={(e) => onChange({ sugarConcentration: e.target.value })}
              disabled={disabled}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="soft-volume">Volume cible (L)</Label>
            <Input
              id="soft-volume"
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
            <Label htmlFor="soft-ph">pH cible</Label>
            <Input
              id="soft-ph"
              type="number"
              inputMode="decimal"
              min="0"
              max="14"
              step="0.1"
              value={fields.targetPh}
              onChange={(e) => onChange({ targetPh: e.target.value })}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Sert d'indicateur d'aide à la décision (seuil 4,6).
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="soft-storage">Mode de conservation</Label>
            <Select
              id="soft-storage"
              value={fields.storageMode}
              onChange={(e) => onChange({ storageMode: e.target.value as StorageMode | "" })}
              disabled={disabled}
            >
              <option value="">Non renseigné</option>
              {storageModeSchema.options.map((mode) => (
                <option key={mode} value={mode}>
                  {STORAGE_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="soft-stabilization">Méthode de stabilisation</Label>
            <Select
              id="soft-stabilization"
              value={fields.stabilizationMethod}
              onChange={(e) =>
                onChange({ stabilizationMethod: e.target.value as StabilizationMethod | "" })
              }
              disabled={disabled}
            >
              <option value="">Aucune (non stabilisée)</option>
              {stabilizationMethodSchema.options.map((method) => (
                <option key={method} value={method}>
                  {STABILIZATION_LABELS[method]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Requise pour un stockage ambiant à pH au-dessus du seuil (indicateur d'aide à la
              décision).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
