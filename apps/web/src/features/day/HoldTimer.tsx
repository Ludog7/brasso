/**
 * Compte à rebours du palier (M4-10). L'**autorité reste le serveur** : le timer est
 * armé côté serveur (`timer.startedAt`, horodatage serveur, ADR-08) ; ici on ne fait
 * que **raffraîchir l'affichage** en recalculant `stepTiming(state, now)` à intervalle
 * avec l'horloge locale (`useNow`). « Valider » ne s'active qu'à `holdElapsed`, et le
 * serveur re-vérifie de toute façon (un `VALIDATE_STEP` prématuré est refusé, 409).
 * Le dépassement (`holdOverrunMin`) est signalé sans bloquer.
 */

import { type DayState, stepTiming } from "@brasso/core";
import { Check, Loader2 } from "lucide-react";

import { formatMinSec } from "@/features/day/format";
import { useNow } from "@/features/day/hooks";
import { RampInfo } from "@/features/day/RampInfo";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

export function HoldTimer({
  state,
  onValidate,
  pending,
}: {
  state: DayState;
  onValidate: () => void;
  pending: boolean;
}) {
  const now = useNow();
  const timing = stepTiming(state, now);

  const remaining = timing?.holdRemainingMin ?? 0;
  const overrun = timing?.holdOverrunMin ?? 0;
  const elapsed = timing?.holdElapsed ?? false;
  const plannedHold = timing?.plannedHoldMin ?? null;

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm uppercase tracking-wide text-muted-foreground">Palier</span>
        <span
          role="timer"
          aria-label="Temps de palier restant"
          className="font-mono text-5xl tabular-nums"
        >
          {formatMinSec(remaining)}
        </span>
        {plannedHold !== null ? (
          <span className="text-sm text-muted-foreground">sur {plannedHold} min</span>
        ) : null}
      </div>

      {overrun > 0 ? (
        <Badge tone="accent" role="status">
          Dépassement +{formatMinSec(overrun)}
        </Badge>
      ) : null}

      <RampInfo timing={timing} />

      <Button size="lg" className="w-full" disabled={pending || !elapsed} onClick={onValidate}>
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-5" aria-hidden="true" />
        )}
        Valider l'étape
      </Button>
      {!elapsed ? (
        <p className="text-sm text-muted-foreground">Le palier doit s'écouler avant de valider.</p>
      ) : null}
    </div>
  );
}
