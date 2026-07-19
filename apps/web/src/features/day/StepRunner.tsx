/**
 * Dérouleur d'étapes du Jour J (M4-09/10/11/12) — mode normal : **progression
 * contrôlée** étape par étape (spec « State Machine tolérante »). Rend l'étape
 * courante et l'action contextuelle au `StepStatus` :
 * - `PENDING` → « Démarrer l'étape » (`START_STEP`) ;
 * - `AWAITING_STABILIZATION` → `StabilizationGate` (`CONFIRM_STABILIZATION`, M4-10) ;
 * - `TIMER_RUNNING` → `HoldTimer` (compte à rebours, « Valider » à l'écoulement) ;
 * - `AWAITING_VALIDATION` → « Valider l'étape » (`VALIDATE_STEP`), gouverné par le
 *   verdict de `core` (`stepValidationCheck`, M9-03).
 *
 * **Ce verdict n'est pas redérivé ici** (M9-11) : l'écran affichait auparavant sa
 * propre lecture des mesures manquantes, si bien qu'une étape sans minuteur
 * n'offrait aucune issue et qu'un refroidissement hors cible proposait un bouton
 * que le serveur refusait. `stepValidationCheck` est la **règle unique** — un
 * bouton proposé est un bouton qui aboutit, et un blocage est toujours motivé.
 *
 * **Mode manuel** (M4-12) : « Forcer l'étape » est proposé quel que soit le statut
 * (tant que le brassin n'est pas terminé) → `ForceStepDialog` (motif obligatoire →
 * `DeviationLog`). Il est réservé aux conditions non remplies : la validation
 * nominale ci-dessus ne produit **aucun** écart. Le `DeviationJournal` liste les
 * écarts tracés. À la filtration (`LAUTER`), `PreBoilCorrections` (M4-13) propose
 * des corrections densité chiffrées. En fin de plan, écran de clôture (batch
 * `EN_FERMENTATION`) avec lien vers la fiche.
 *
 * **Ensemencement** (M9-12) : sa validation n'est pas immédiate — elle ouvre
 * d'abord `CyclePlanDialog` (durées prévisionnelles, jalons datés), puis émet
 * `VALIDATE_STEP`. C'est la charnière entre le Jour J et un cycle qui se compte
 * en semaines : sans cette saisie, la suite du brassin ne serait pas datée.
 */

import { type StepValidationCheck, stepValidationCheck } from "@brasso/core";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useBatchCycleDefaults } from "@/features/batches/hooks";
import { CyclePlanDialog } from "@/features/day/CyclePlanDialog";
import { DeviationJournal } from "@/features/day/DeviationJournal";
import { ForceStepDialog } from "@/features/day/ForceStepDialog";
import { HoldTimer } from "@/features/day/HoldTimer";
import { useDayEvent } from "@/features/day/hooks";
import { HopSchedule } from "@/features/day/HopSchedule";
import { DAY_PHASE_LABELS } from "@/features/day/labels";
import { MeasurementEntry } from "@/features/day/MeasurementEntry";
import { PhaseProgress } from "@/features/day/PhaseProgress";
import { PreBoilCorrections } from "@/features/day/PreBoilCorrections";
import { StabilizationGate } from "@/features/day/StabilizationGate";
import { StepGuidance } from "@/features/day/StepGuidance";
import type { DaySession } from "@/lib/api";
import { Button } from "@/ui/button";

/**
 * Action de validation **nominale** de l'étape courante. Distincte de « Forcer
 * l'étape » par la place (action principale), le ton (bouton plein) et les mots :
 * valider n'est pas un écart de procédure et ne journalise rien.
 */
function ValidateStep({
  check,
  pending,
  onValidate,
}: {
  check: StepValidationCheck;
  pending: boolean;
  onValidate: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Button
        size="lg"
        className="w-full max-w-xs"
        disabled={pending || !check.canValidate}
        aria-describedby={check.canValidate ? undefined : "step-blocked"}
        onClick={onValidate}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-5" aria-hidden="true" />
        )}
        Valider l'étape
      </Button>

      {check.canValidate && check.awaitsManualValidation ? (
        <p className="max-w-xs text-sm text-muted-foreground">
          Cette étape n'a pas de minuteur : valide-la quand elle est faite.
        </p>
      ) : null}

      {check.canValidate ? null : (
        <div id="step-blocked" role="note" className="max-w-xs text-left text-sm">
          <p className="text-muted-foreground">Il reste à faire avant de valider :</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {check.blockedBy.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
  const [forcing, setForcing] = useState(false);
  const [planningCycle, setPlanningCycle] = useState(false);
  // Chargés dès l'ouverture de l'écran, pas à l'ouverture du dialogue : la fin
  // du Jour J peut se dérouler hors couverture réseau, et une saisie
  // pré-remplie suppose que les défauts soient déjà en cache (M9-16).
  const cycleDefaults = useBatchCycleDefaults(batchId);
  const { plan, cursor, status } = day.state;

  if (cursor >= plan.length) {
    return <FinishScreen batchId={batchId} />;
  }

  const step = plan[cursor];
  /**
   * L'ensemencement ne se valide pas comme une étape ordinaire (M9-12 §A) : sa
   * validation ouvre d'abord la saisie des durées du cycle, **avant** de clore
   * le Jour J. C'est le seul moment où le brassin bascule d'un déroulé à la
   * minute vers des phases qui se comptent en semaines.
   */
  const isPitching = step?.phase === "PITCHING";
  const validateStep = (): void => {
    if (isPitching) {
      setPlanningCycle(true);
      return;
    }
    event.mutate({ type: "VALIDATE_STEP" });
  };
  const hasMeasurements = (step?.requiredMeasurements?.length ?? 0) > 0;
  const showMeasures =
    step && hasMeasurements && (status === "TIMER_RUNNING" || status === "AWAITING_VALIDATION");
  // Verdict de `core` — même règle que la garde serveur (M9-03). En
  // `AWAITING_VALIDATION` aucun timer ne court, l'instant n'influe donc pas.
  const check = stepValidationCheck(day.state, Date.now());

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
      <PhaseProgress plan={plan} cursor={cursor} />

      <div className="flex flex-col items-center gap-2">
        <span className="text-sm uppercase tracking-wide text-muted-foreground">
          Étape {cursor + 1} / {plan.length}
        </span>
        <h2 className="text-4xl font-semibold">{DAY_PHASE_LABELS[day.phase]}</h2>
        {step?.label ? <p className="text-lg text-muted-foreground">{step.label}</p> : null}
        {step?.plannedHoldMin !== undefined ? (
          <p className="text-sm text-muted-foreground">Durée prévue : {step.plannedHoldMin} min</p>
        ) : null}
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
          <HoldTimer state={day.state} pending={event.isPending} onValidate={validateStep} />
        ) : null}

        {status === "AWAITING_VALIDATION" ? (
          <ValidateStep check={check} pending={event.isPending} onValidate={validateStep} />
        ) : null}
      </div>

      {step ? <StepGuidance step={step} /> : null}

      {step ? <HopSchedule step={step} state={day.state} /> : null}

      {showMeasures && step ? (
        <MeasurementEntry step={step} state={day.state} snapshot={snapshot} batchId={batchId} />
      ) : null}

      {step?.phase === "LAUTER" ? (
        <PreBoilCorrections step={step} state={day.state} batchId={batchId} />
      ) : null}

      {step ? (
        <div className="flex w-full flex-col items-center gap-1">
          <Button
            variant="outline"
            className="w-full max-w-xs text-muted-foreground"
            onClick={() => setForcing(true)}
          >
            <AlertTriangle className="size-5" aria-hidden="true" />
            Forcer l'étape
          </Button>
          <p className="max-w-xs text-xs text-muted-foreground">
            Réservé aux conditions non remplies : un forçage consigne un écart de procédure au
            journal.
          </p>
        </div>
      ) : null}

      <DeviationJournal batchId={batchId} />

      {forcing && step ? (
        <ForceStepDialog step={step} batchId={batchId} onClose={() => setForcing(false)} />
      ) : null}

      {planningCycle ? (
        <CyclePlanDialog
          batchId={batchId}
          defaults={cycleDefaults.data ?? null}
          onPlanned={() => {
            setPlanningCycle(false);
            event.mutate({ type: "VALIDATE_STEP" });
          }}
          onSkip={() => {
            setPlanningCycle(false);
            event.mutate({ type: "VALIDATE_STEP" });
          }}
          onClose={() => setPlanningCycle(false)}
        />
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
