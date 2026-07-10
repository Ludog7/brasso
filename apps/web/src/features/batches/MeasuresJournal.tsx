import { batchMeasureSchema } from "@brasso/core";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { useAddMeasure, useBatchMeasures } from "@/features/batches/hooks";
import type { MeasureType } from "@/lib/api";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

import { MEASURE_DEFAULT_UNIT, MEASURE_TYPE_LABELS, MEASURE_TYPES } from "./labels";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/**
 * Journal de mesures d'un batch (M3-09) : formulaire d'ajout append-only
 * (`type`, `value`, `unit?`, `phase?`) validé côté client par `batchMeasureSchema`
 * (@brasso/core, bornes de plausibilité par type) + tableau chronologique.
 */
export function MeasuresJournal({ batchId }: { batchId: string }) {
  const measures = useBatchMeasures(batchId);
  const add = useAddMeasure(batchId);

  const [type, setType] = useState<MeasureType>("GRAVITY");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState(MEASURE_DEFAULT_UNIT.GRAVITY);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onTypeChange = (next: MeasureType): void => {
    setType(next);
    setUnit(MEASURE_DEFAULT_UNIT[next]);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (add.isPending) return;
    const candidate = {
      type,
      value: value.trim() === "" ? Number.NaN : Number(value),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      ...(phase.trim() ? { phase: phase.trim() } : {}),
    };
    const parsed = batchMeasureSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Valeur invalide.");
      return;
    }
    setError(null);
    add.mutate(parsed.data, {
      onSuccess: () => {
        setValue("");
        setPhase("");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Journal de mesures</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit} noValidate>
          <div className="flex min-w-40 flex-col gap-2">
            <Label htmlFor="measure-type">Type</Label>
            <Select
              id="measure-type"
              value={type}
              onChange={(e) => onTypeChange(e.target.value as MeasureType)}
              disabled={add.isPending}
            >
              {MEASURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEASURE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-28 flex-col gap-2">
            <Label htmlFor="measure-value">Valeur</Label>
            <Input
              id="measure-value"
              type="number"
              inputMode="decimal"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={add.isPending}
            />
          </div>
          <div className="flex w-24 flex-col gap-2">
            <Label htmlFor="measure-unit">Unité</Label>
            <Input
              id="measure-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={add.isPending}
              placeholder="optionnel"
            />
          </div>
          <div className="flex min-w-36 flex-1 flex-col gap-2">
            <Label htmlFor="measure-phase">Phase</Label>
            <Input
              id="measure-phase"
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              disabled={add.isPending}
              placeholder="optionnel"
            />
          </div>
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              "Ajouter"
            )}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {add.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Enregistrement impossible. Réessaie dans un instant.
          </p>
        ) : null}

        {measures.isPending ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <span>Chargement des mesures…</span>
          </div>
        ) : measures.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Impossible de charger les mesures.
          </p>
        ) : measures.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune mesure enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Valeur</th>
                  <th className="py-2 font-medium">Phase</th>
                </tr>
              </thead>
              <tbody>
                {measures.data.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {dateTimeFmt.format(new Date(m.loggedAt))}
                    </td>
                    <td className="py-2 pr-4">{MEASURE_TYPE_LABELS[m.type]}</td>
                    <td className="py-2 pr-4 font-medium">
                      {m.value}
                      {m.unit ? ` ${m.unit}` : ""}
                    </td>
                    <td className="py-2 text-muted-foreground">{m.phase ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
