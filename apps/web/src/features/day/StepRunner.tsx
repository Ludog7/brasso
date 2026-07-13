/**
 * Dérouleur d'étapes du Jour J (M4-09) — mode normal : **progression contrôlée**
 * étape par étape (spec « State Machine tolérante »). Rend l'étape courante et
 * propose l'action contextuelle au `StepStatus` : `PENDING` → « Démarrer »
 * (`START_STEP`), `AWAITING_VALIDATION` → « Valider l'étape » (`VALIDATE_STEP`).
 * Stabilisation/timers (M4-10), mesures (M4-11) et forçage (M4-12) sont hors
 * périmètre : leurs statuts intermédiaires désactivent l'action. En fin de plan,
 * écran de clôture (batch `EN_FERMENTATION`) avec lien vers la fiche batch.
 */

import type { StepStatus } from "@brasso/core";
import { Check, CheckCircle2, Loader2, type LucideIcon, Play } from "lucide-react";
import { Link } from "react-router-dom";

import { useDayEvent } from "@/features/day/hooks";
import { DAY_PHASE_LABELS } from "@/features/day/labels";
import { PhaseProgress } from "@/features/day/PhaseProgress";
import type { DayEventRequest, DaySession } from "@/lib/api";
import { Button } from "@/ui/button";

/** Action primaire câblée sur un statut « actionnable » (sinon `null` → désactivée). */
interface StepAction {
  label: string;
  event: DayEventRequest;
  icon: LucideIcon;
}

/** Boutons contextuels (spec) : seuls `PENDING` et `AWAITING_VALIDATION` agissent. */
function actionFor(status: StepStatus): StepAction | null {
  switch (status) {
    case "PENDING":
      return { label: "Démarrer l'étape", event: { type: "START_STEP" }, icon: Play };
    case "AWAITING_VALIDATION":
      return { label: "Valider l'étape", event: { type: "VALIDATE_STEP" }, icon: Check };
    default:
      return null;
  }
}

/** Pourquoi l'action est indisponible dans un statut intermédiaire (hors périmètre M4-09). */
const STATUS_HINTS: Partial<Record<StepStatus, string>> = {
  AWAITING_STABILIZATION: "En attente de confirmation de la stabilisation de température.",
  TIMER_RUNNING: "Palier en cours : le timer doit s'écouler avant de valider.",
};

export function StepRunner({ day, batchId }: { day: DaySession; batchId: string }) {
  const event = useDayEvent(batchId);
  const { plan, cursor, status } = day.state;

  if (cursor >= plan.length) {
    return <FinishScreen batchId={batchId} />;
  }

  const step = plan[cursor];
  const action = actionFor(status);
  const ActionIcon = action?.icon;

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
        {action && ActionIcon ? (
          <Button
            size="lg"
            className="w-full max-w-xs"
            disabled={event.isPending}
            onClick={() => event.mutate(action.event)}
          >
            {event.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <ActionIcon className="size-5" aria-hidden="true" />
            )}
            {action.label}
          </Button>
        ) : (
          <>
            <Button size="lg" className="w-full max-w-xs" disabled>
              <Check className="size-5" aria-hidden="true" />
              Valider l'étape
            </Button>
            {STATUS_HINTS[status] ? (
              <p className="text-sm text-muted-foreground">{STATUS_HINTS[status]}</p>
            ) : null}
          </>
        )}
      </div>
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
