/**
 * Saisie des **mesures** d'une étape Jour J (M4-11). Rappelle les `requiredMeasurements`
 * de l'étape courante, envoie un `RECORD_MEASUREMENT` ({{M1-13}} — ne change pas le
 * statut, alimente le journal du batch M3-09), liste les mesures déjà relevées et
 * affiche l'**écart au modèle** (`DeviationHint`). Contrôles tactiles, clavier
 * numérique. Le type est restreint aux mesures **requises** par l'étape.
 */

import {
  type DayState,
  type MeasurementKind,
  measurementsForStep,
  type StepSpec,
} from "@brasso/core";
import { Loader2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { DeviationHint } from "@/features/day/DeviationHint";
import { formatClock, formatMeasurement } from "@/features/day/format";
import { useDayEvent } from "@/features/day/hooks";
import { MEASUREMENT_LABELS } from "@/features/day/labels";
import { modelTarget } from "@/features/day/model";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

export function MeasurementEntry({
  step,
  state,
  snapshot,
  batchId,
}: {
  step: StepSpec;
  state: DayState;
  snapshot: unknown;
  batchId: string;
}) {
  const event = useDayEvent(batchId);
  const required = step.requiredMeasurements ?? [];
  const recorded = measurementsForStep(state, step.id);
  const present = new Set(recorded.map((m) => m.kind));
  const missing = required.filter((k) => !present.has(k));

  const [kind, setKind] = useState<MeasurementKind>(missing[0] ?? required[0] ?? "density");
  const [value, setValue] = useState("");

  const parsed = Number(value.trim());
  const canSubmit = value.trim() !== "" && Number.isFinite(parsed) && !event.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    event.mutate(
      { type: "RECORD_MEASUREMENT", kind, value: parsed },
      { onSuccess: () => setValue("") },
    );
  };

  return (
    <section aria-label="Mesures de l'étape" className="flex w-full max-w-xs flex-col gap-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Mesures</h3>

      {required.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Requises : {required.map((k) => MEASUREMENT_LABELS[k]).join(", ")}
          {missing.length > 0
            ? ` — manquante(s) : ${missing.map((k) => MEASUREMENT_LABELS[k]).join(", ")}`
            : " — complètes"}
        </p>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 text-left">
          <Label htmlFor="measure-kind">Type de mesure</Label>
          <Select
            id="measure-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as MeasurementKind)}
          >
            {required.map((k) => (
              <option key={k} value={k}>
                {MEASUREMENT_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1 text-left">
          <Label htmlFor="measure-value">Valeur relevée</Label>
          <Input
            id="measure-value"
            type="number"
            inputMode="decimal"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" disabled={!canSubmit}>
          {event.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-5" aria-hidden="true" />
          )}
          Enregistrer la mesure
        </Button>
      </form>

      {recorded.length > 0 ? (
        <ul className="flex flex-col gap-2 text-left">
          {recorded.map((m, i) => (
            <li key={`${m.kind}-${m.at}-${i}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{MEASUREMENT_LABELS[m.kind]}</span>
              <span className="tabular-nums">{formatMeasurement(m.kind, m.value)}</span>
              {/* Horodatage : une descente en température se lit dans la suite
                  des relevés, pas dans le dernier seul (M9-11 §B). */}
              <span className="tabular-nums text-muted-foreground">à {formatClock(m.at)}</span>
              <DeviationHint
                kind={m.kind}
                value={m.value}
                target={modelTarget(snapshot, step, m.kind)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
