/**
 * Palier sanctuarisé (M4-10, spec « State Machine tolérante ») : le timer de palier
 * **ne s'arme qu'après** confirmation de la stabilisation à la température cible.
 * Tant que l'opérateur n'a pas confirmé (`CONFIRM_STABILIZATION`), **aucun compte
 * à rebours** n'est affiché. La température relevée est **optionnelle** (saisie
 * manuelle ou future sonde) et, si fournie, journalisée comme mesure par la machine.
 */

import type { StepSpec, StepTiming } from "@brasso/core";
import { Loader2, Thermometer } from "lucide-react";
import { useState } from "react";

import { RampInfo } from "@/features/day/RampInfo";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

/** Convertit la saisie en °C exploitable (`undefined` si vide ou non numérique). */
function parseTemperature(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

export function StabilizationGate({
  step,
  timing,
  onConfirm,
  pending,
}: {
  step: StepSpec;
  timing: StepTiming | null;
  onConfirm: (temperatureC?: number) => void;
  pending: boolean;
}) {
  const [temperature, setTemperature] = useState("");

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <p className="text-muted-foreground">
        {step.targetTempC !== undefined
          ? `Amène le moût à ${step.targetTempC} °C, puis confirme.`
          : "Confirme la stabilisation à la température de palier."}
      </p>

      <RampInfo timing={timing} />

      <div className="flex w-full flex-col gap-1.5 text-left">
        <Label htmlFor="stabilization-temp">Température relevée (°C, optionnel)</Label>
        <Input
          id="stabilization-temp"
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder={step.targetTempC !== undefined ? String(step.targetTempC) : "—"}
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
        />
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => onConfirm(parseTemperature(temperature))}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Thermometer className="size-5" aria-hidden="true" />
        )}
        Confirmer la stabilisation
      </Button>
    </div>
  );
}
