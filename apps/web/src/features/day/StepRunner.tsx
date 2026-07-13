/**
 * Dérouleur d'étapes du Jour J (M4-09/10/11) — mode normal : **progression contrôlée**
 * étape par étape (spec « State Machine tolérante »). Rend l'étape courante et
 * l'action contextuelle au `StepStatus` :
 * - `PENDING` → « Démarrer l'étape » (`START_STEP`) ;
 * - `AWAITING_STABILIZATION` → `StabilizationGate` (`CONFIRM_STABILIZATION`, M4-10) ;
 * - `TIMER_RUNNING` → `HoldTimer` (compte à rebours, « Valider » à l'écoulement) ;
 * - `AWAITING_VALIDATION` → « Valider l'étape » (`VALIDATE_STEP`), **si** les mesures
 *   requises sont saisies ; sinon on invite à les relever (`MeasurementEntry`, M4-11).
 *
 * Le forçage (M4-12) est hors périmètre. En fin de plan, écran de clôture (batch
 * `EN_FERMENTATION`) avec lien vers la fiche batch.
 */

import {
  type DayState,
  type MeasurementKind,
  measurementsForStep,
  type StepSpec,
} from "@brasso/core";
import { CheckCircle2, Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";

import { HoldTimer } from "@/features/day/HoldTimer";
import { useDayEvent } from "@/features/day/hooks";
import { DAY_PHASE_LABELS, MEASUREMENT_LABELS } from "@/features/day/labels";
import { MeasurementEntry } from "@/features/day/MeasurementEntry";
import { PhaseProgress } from "@/features/day/PhaseProgress";
import { StabilizationGate } from "@/features/day/StabilizationGate";
import type { DaySession } from "@/lib/api";
import { Button } from "@/ui/button";

/** Mesures requises encore manquantes pour l'étape (miroir de la garde serveur M1-13). */
function missingMeasurements(step: StepSpec, state: DayState): MeasurementKind[] {
  const required = step.requiredMeasurements ?? [];
  const present = new Set(measurementsForStep(state, step.id).map((m) => m.kind));
  return required.filter((k) => !present.has(k));
}

export function StepRunner({
  day,
  batchId,
  snapshot,
}: {
  day: DaySession;
  batchId: string;
  snapshot: unknown;
}) {
  const event = useDayEvent(batchId);
  const { plan, cursor, status } = day.state;

  if (cursor >= plan.length) {
    return <FinishScreen batchId={batchId} />;
  }

  const step = plan[cursor];
  const missing = step ? missingMeasurements(step, day.state) : [];
  const hasMeasurements = (step?.requiredMeasurements?.length ?? 0) > 0;
  const showMeasures =
    step && hasMeasurements && (status === "TIMER_RUNNING" || status === "AWAITING_VALIDATION");

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
      <PhaseProgress plan={plan} cursor={cursor} />

      <div className="flex flex-col items-center gap-2">
        <span className="text-sm uppercase tracking-wide text-muted-foreground">
          Étape {cursor + 1} / {plan.length}
        </span>
        <h2 className="text-4xl font-semibold">{DAY_PHASE_LABELS[day.phase]}</h2>
        {step?.label ? <p className="text-lg text-muted-foreground">{step.label}</p> : null}
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        {status === "PENDING" ? (
          <Button
            size="lg"
            className="w-full max-w-xs"
            disabled={event.isPending}
            onClick={() => event.mutate({ type: "START_STEP" })}
          >
            {event.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="size-5" aria-hidden="true" />
            )}
            Démarrer l'étape
          </Button>
        ) : null}

        {status === "AWAITING_STABILIZATION" && step ? (
          <StabilizationGate
            step={step}
            timing={day.timings}
            pending={event.isPending}
            onConfirm={(temperatureC) =>
              event.mutate(
                temperatureC === undefined
                  ? { type: "CONFIRM_STABILIZATION" }
                  : { type: "CONFIRM_STABILIZATION", temperatureC },
              )
            }
          />
        ) : null}

        {status === "TIMER_RUNNING" ? (
          <HoldTimer
            state={day.state}
            pending={event.isPending}
            onValidate={() => event.mutate({ type: "VALIDATE_STEP" })}
          />
        ) : null}

        {status === "AWAITING_VALIDATION" ? (
          missing.length === 0 ? (
            <Button
              size="lg"
              className="w-full max-w-xs"
              disabled={event.isPending}
              onClick={() => event.mutate({ type: "VALIDATE_STEP" })}
            >
              {event.isPending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              )}
              Valider l'étape
            </Button>
          ) : (
            <p role="note" className="max-w-xs text-sm text-muted-foreground">
              Mesures requises manquantes : {missing.map((k) => MEASUREMENT_LABELS[k]).join(", ")}.
              Relève-les ci-dessous pour valider en mode normal.
            </p>
          )
        ) : null}
      </div>

      {showMeasures && step ? (
        <MeasurementEntry step={step} state={day.state} snapshot={snapshot} batchId={batchId} />
      ) : null}
    </div>
  );
}

/** Écran de clôture : le brassin passe en fermentation (M4-05), lien vers la fiche batch. */
function FinishScreen({ batchId }: { batchId: string }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <CheckCircle2 className="size-16 text-emerald-400" aria-hidden="true" />
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-3xl font-semibold">Brassin terminé</h2>
        <p className="max-w-sm text-muted-foreground">
          Toutes les étapes sont validées : le brassin passe en fermentation. Son suivi continue sur
          la fiche du batch.
        </p>
      </div>
      <Button asChild size="lg">
        <Link to={`/batches/${batchId}`}>Voir le détail du batch</Link>
      </Button>
    </div>
  );
}
