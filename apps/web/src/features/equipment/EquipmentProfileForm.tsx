import { equipmentProfileSchema } from "@brasso/core";
import { Loader2 } from "lucide-react";
import { type FormEvent, type InputHTMLAttributes, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useBeforeUnload } from "@/features/recipes/useBeforeUnload";
import type { EquipmentCreateInput, EquipmentProfile } from "@/lib/api";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

/** Ions de l'analyse d'eau de base (mg/L). Schéma strict = M3-02 ; JSON opaque ici. */
const ION_KEYS = ["calcium", "magnesium", "sodium", "sulfate", "chloride", "bicarbonate"] as const;
type IonKey = (typeof ION_KEYS)[number];

const ION_LABELS: Record<IonKey, string> = {
  calcium: "Calcium (Ca²⁺)",
  magnesium: "Magnésium (Mg²⁺)",
  sodium: "Sodium (Na⁺)",
  sulfate: "Sulfate (SO₄²⁻)",
  chloride: "Chlorure (Cl⁻)",
  bicarbonate: "Bicarbonate (HCO₃⁻)",
};

type NumericKey =
  | "nominalVolumeL"
  | "deadspaceL"
  | "transferLossL"
  | "evaporationRateLPerHour"
  | "grainAbsorptionLPerKg"
  | "heatingPowerKw"
  | "thermalMassKjPerC";

type FieldKey = "name" | NumericKey | IonKey;
type FormState = Record<FieldKey, string>;
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Messages d'erreur alignés sur les contraintes de `equipmentProfileSchema`. */
const FIELD_MESSAGES: Partial<Record<FieldKey, string>> = {
  name: "Le nom est requis.",
  nominalVolumeL: "Le volume nominal doit être strictement positif (L).",
  deadspaceL: "Le volume mort doit être ≥ 0 (L).",
  transferLossL: "Les pertes au transfert doivent être ≥ 0 (L).",
  evaporationRateLPerHour: "Le taux d'évaporation doit être ≥ 0 (L/h).",
  grainAbsorptionLPerKg: "L'absorption du grain doit être ≥ 0 (L/kg).",
  heatingPowerKw: "La puissance de chauffe doit être strictement positive (kW).",
  thermalMassKjPerC: "La masse thermique doit être strictement positive (kJ/°C).",
};

const EMPTY_STATE: FormState = {
  name: "",
  nominalVolumeL: "",
  deadspaceL: "",
  transferLossL: "",
  evaporationRateLPerHour: "",
  grainAbsorptionLPerKg: "",
  heatingPowerKw: "",
  thermalMassKjPerC: "",
  calcium: "",
  magnesium: "",
  sodium: "",
  sulfate: "",
  chloride: "",
  bicarbonate: "",
};

/** Lit l'analyse d'eau de base depuis le JSON opaque `waterProfiles.source`. */
function readSource(waterProfiles: unknown): Partial<Record<IonKey, number>> {
  if (!waterProfiles || typeof waterProfiles !== "object") return {};
  const source = (waterProfiles as { source?: unknown }).source;
  if (!source || typeof source !== "object") return {};
  const out: Partial<Record<IonKey, number>> = {};
  for (const key of ION_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

const asStr = (n: number | null | undefined): string => (n == null ? "" : String(n));

/** État initial : vide (création) ou préremplit depuis un profil existant (édition). */
function initialState(profile?: EquipmentProfile): FormState {
  if (!profile) return EMPTY_STATE;
  const source = readSource(profile.waterProfiles);
  return {
    name: profile.name,
    nominalVolumeL: asStr(profile.nominalVolumeL),
    deadspaceL: asStr(profile.deadspaceL),
    transferLossL: asStr(profile.transferLossL),
    evaporationRateLPerHour: asStr(profile.evaporationRateLPerHour),
    grainAbsorptionLPerKg: asStr(profile.grainAbsorptionLPerKg),
    heatingPowerKw: asStr(profile.heatingPowerKw),
    thermalMassKjPerC: asStr(profile.thermalMassKjPerC),
    calcium: asStr(source.calcium),
    magnesium: asStr(source.magnesium),
    sodium: asStr(source.sodium),
    sulfate: asStr(source.sulfate),
    chloride: asStr(source.chloride),
    bicarbonate: asStr(source.bicarbonate),
  };
}

const toNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : Number(trimmed);
};

/** Assemble `waterProfiles.source` avec les seuls ions renseignés (numériques). */
function buildWaterProfiles(state: FormState): { source: Record<string, number> } | undefined {
  const source: Record<string, number> = {};
  for (const key of ION_KEYS) {
    const value = toNumber(state[key]);
    if (value !== undefined && Number.isFinite(value)) source[key] = value;
  }
  return Object.keys(source).length > 0 ? { source } : undefined;
}

export interface EquipmentProfileFormProps {
  /** Profil à éditer ; absent = création. */
  profile?: EquipmentProfile;
  submitLabel: string;
  onSubmit: (input: EquipmentCreateInput) => void;
  isPending: boolean;
  isError: boolean;
  /** Lien/route de retour (annulation). */
  onCancelHref: string;
}

/**
 * Formulaire de profil d'équipement (M3-07). Validation client via le schéma Zod
 * partagé (`equipmentProfileSchema`, ADR-04) + garde « modifications non
 * enregistrées » (pattern M2-05). Cible tactile (≥ 48 px, unités explicites).
 */
export function EquipmentProfileForm({
  profile,
  submitLabel,
  onSubmit,
  isPending,
  isError,
  onCancelHref,
}: EquipmentProfileFormProps) {
  const initial = useMemo(() => initialState(profile), [profile]);
  const [state, setState] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const dirty = useMemo(
    () => (Object.keys(initial) as FieldKey[]).some((key) => state[key] !== initial[key]),
    [state, initial],
  );
  useBeforeUnload(dirty && !isPending);

  const set = (key: FieldKey, value: string): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isPending) return;

    const nextErrors: FieldErrors = {};
    // Ions : validation locale (≥ 0) — le schéma partagé les traite en JSON opaque.
    for (const key of ION_KEYS) {
      const trimmed = state[key].trim();
      if (trimmed !== "" && !(Number(trimmed) >= 0)) {
        nextErrors[key] = "Valeur ≥ 0 attendue (mg/L).";
      }
    }

    const candidate = {
      name: state.name.trim(),
      nominalVolumeL: toNumber(state.nominalVolumeL),
      deadspaceL: toNumber(state.deadspaceL),
      transferLossL: toNumber(state.transferLossL),
      evaporationRateLPerHour: toNumber(state.evaporationRateLPerHour),
      grainAbsorptionLPerKg: toNumber(state.grainAbsorptionLPerKg),
      heatingPowerKw: toNumber(state.heatingPowerKw),
      thermalMassKjPerC: toNumber(state.thermalMassKjPerC),
      waterProfiles: buildWaterProfiles(state),
    };
    const parsed = equipmentProfileSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "") as FieldKey;
        if (field && !(field in nextErrors)) {
          nextErrors[field] = FIELD_MESSAGES[field] ?? issue.message;
        }
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    onSubmit(parsed.success ? parsed.data : (candidate as EquipmentCreateInput));
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identité</CardTitle>
        </CardHeader>
        <CardContent>
          <NumberField
            id="eq-name"
            label="Nom du profil"
            type="text"
            value={state.name}
            error={errors.name}
            disabled={isPending}
            autoFocus
            onChange={(e) => set("name", e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Volumes &amp; pertes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <NumberField
            id="eq-nominalVolumeL"
            label="Volume nominal"
            unit="L"
            required
            value={state.nominalVolumeL}
            error={errors.nominalVolumeL}
            disabled={isPending}
            onChange={(e) => set("nominalVolumeL", e.target.value)}
          />
          <NumberField
            id="eq-deadspaceL"
            label="Volume mort"
            unit="L"
            value={state.deadspaceL}
            error={errors.deadspaceL}
            disabled={isPending}
            onChange={(e) => set("deadspaceL", e.target.value)}
          />
          <NumberField
            id="eq-transferLossL"
            label="Pertes au transfert"
            unit="L"
            value={state.transferLossL}
            error={errors.transferLossL}
            disabled={isPending}
            onChange={(e) => set("transferLossL", e.target.value)}
          />
          <NumberField
            id="eq-evaporationRateLPerHour"
            label="Taux d'évaporation"
            unit="L/h"
            value={state.evaporationRateLPerHour}
            error={errors.evaporationRateLPerHour}
            disabled={isPending}
            onChange={(e) => set("evaporationRateLPerHour", e.target.value)}
          />
          <NumberField
            id="eq-grainAbsorptionLPerKg"
            label="Absorption du grain"
            unit="L/kg"
            value={state.grainAbsorptionLPerKg}
            error={errors.grainAbsorptionLPerKg}
            disabled={isPending}
            onChange={(e) => set("grainAbsorptionLPerKg", e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Chauffe (optionnel)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <NumberField
            id="eq-heatingPowerKw"
            label="Puissance de chauffe"
            unit="kW"
            value={state.heatingPowerKw}
            error={errors.heatingPowerKw}
            disabled={isPending}
            onChange={(e) => set("heatingPowerKw", e.target.value)}
          />
          <NumberField
            id="eq-thermalMassKjPerC"
            label="Masse thermique"
            unit="kJ/°C"
            value={state.thermalMassKjPerC}
            error={errors.thermalMassKjPerC}
            disabled={isPending}
            onChange={(e) => set("thermalMassKjPerC", e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analyse d'eau de base (optionnel)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {ION_KEYS.map((key) => (
            <NumberField
              key={key}
              id={`eq-${key}`}
              label={ION_LABELS[key]}
              unit="mg/L"
              value={state[key]}
              error={errors[key]}
              disabled={isPending}
              onChange={(e) => set(key, e.target.value)}
            />
          ))}
        </CardContent>
      </Card>

      {isError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
        >
          Enregistrement impossible. Vérifie ta connexion puis réessaie.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Enregistrement…
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to={onCancelHref}>Annuler</Link>
        </Button>
        {dirty ? (
          <span className="text-sm text-muted-foreground">Modifications non enregistrées</span>
        ) : null}
      </div>
    </form>
  );
}

interface NumberFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  unit?: string;
  error?: string;
}

/** Champ étiqueté (unité + message d'erreur). Numérique par défaut (`step="any"`). */
function NumberField({ id, label, unit, error, type = "number", ...props }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {unit ? <span className="text-muted-foreground"> ({unit})</span> : null}
      </Label>
      <Input
        id={id}
        type={type}
        {...(type === "number" ? { inputMode: "decimal", step: "any", min: 0 } : {})}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
