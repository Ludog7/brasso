/**
 * Comparaison **montée en chauffe estimée vs réelle** (M4-10, `stepTiming`). La
 * montée réelle (`actualRampMin`) n'est connue **qu'après** confirmation de la
 * stabilisation (`stabilizedAt − stepStartedAt`) ; avant, seule l'estimation
 * (`plannedRampMin`) est affichée. Sert la calibration du matériel (spec M3).
 */

import type { StepTiming } from "@brasso/core";

import { formatMinutes } from "@/features/day/format";

export function RampInfo({ timing }: { timing: StepTiming | null }) {
  if (!timing) return null;
  const { plannedRampMin, actualRampMin } = timing;
  if (plannedRampMin === null && actualRampMin === null) return null;

  return (
    <dl className="flex gap-8 text-sm">
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground">Montée estimée</dt>
        <dd className="font-medium tabular-nums">{formatMinutes(plannedRampMin)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground">Montée réelle</dt>
        <dd className="font-medium tabular-nums">{formatMinutes(actualRampMin)}</dd>
      </div>
    </dl>
  );
}
