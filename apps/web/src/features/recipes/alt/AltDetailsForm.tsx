import { type StabilizationMethod, stabilizationMethodSchema } from "@brasso/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";
import { Textarea } from "@/ui/textarea";

import { DRINK_TYPES } from "../labels";
import type { AltFormState } from "./mapToEngine";

/** Champs scalaires de détail pilotés par ce formulaire. */
export type AltDetailsFields = Pick<
  AltFormState,
  | "name"
  | "description"
  | "baseType"
  | "targetPh"
  | "stabilizationMethod"
  | "residualSugarRisk"
  | "batchVolumeL"
>;

/**
 * Types de base proposés = types de boisson ALT (réutilisés de `labels`, évite la
 * divergence des libellés) + « Autre » (`baseType` est une taxonomie libre, ADR-01).
 */
const BASE_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  ...DRINK_TYPES.filter((d) => d.engine === "ALT_FERMENTED").map((d) => ({
    value: d.value,
    label: d.label,
  })),
  { value: "AUTRE", label: "Autre" },
];

/** Libellés FR des méthodes de stabilisation (enum core `StabilizationMethod`). */
const STABILIZATION_LABELS: Record<StabilizationMethod, string> = {
  PASTEURIZATION: "Pasteurisation",
  THERMAL: "Traitement thermique",
  COLD_CHAIN: "Chaîne du froid",
  FILTRATION_ACIDIFICATION: "Filtration + acidification",
  CHEMICAL: "Stabilisation chimique",
  OTHER: "Autre méthode",
};

interface AltDetailsFormProps {
  fields: AltDetailsFields;
  disabled?: boolean;
  onChange: (patch: Partial<AltDetailsFields>) => void;
}

export function AltDetailsForm({ fields, disabled, onChange }: AltDetailsFormProps) {
  // Un `baseType` chargé hors liste connue reste sélectionnable (round-trip).
  const baseTypeOptions = BASE_TYPE_OPTIONS.some((o) => o.value === fields.baseType)
    ? BASE_TYPE_OPTIONS
    : [...BASE_TYPE_OPTIONS, { value: fields.baseType, label: fields.baseType }];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Détails</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="alt-name">Nom</Label>
          <Input
            id="alt-name"
            value={fields.name}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="alt-description">Description</Label>
          <Textarea
            id="alt-description"
            value={fields.description}
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={disabled}
            placeholder="Notes qualitatives : acidité, couleur estimée, aromatique…"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="alt-base-type">Type de base</Label>
            <Select
              id="alt-base-type"
              value={fields.baseType}
              onChange={(e) => onChange({ baseType: e.target.value })}
              disabled={disabled}
            >
              {baseTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="alt-volume">Volume cible (L)</Label>
            <Input
              id="alt-volume"
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
            <Label htmlFor="alt-ph">pH cible</Label>
            <Input
              id="alt-ph"
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
            <Label htmlFor="alt-stabilization">Méthode de stabilisation</Label>
            <Select
              id="alt-stabilization"
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
          </div>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-primary"
            checked={fields.residualSugarRisk}
            onChange={(e) => onChange({ residualSugarRisk: e.target.checked })}
            disabled={disabled}
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              Sucre résiduel fermentescible
            </span>
            <span className="text-xs text-muted-foreground">
              Du sucre non fermenté au conditionnement peut refermenter en bouteille (indicateur de
              risque de surpression).
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
