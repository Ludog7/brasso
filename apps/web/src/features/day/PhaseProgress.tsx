/**
 * Fil de progression des **phases** du Jour J (M4-09). Le plan est une suite
 * d'étapes (une phase peut se répéter — empâtage multi-paliers) ; ici on affiche
 * la séquence des phases distinctes, dans l'ordre, avec la phase courante mise en
 * avant et les phases franchies estompées. Purement présentationnel (dérivé du
 * plan + curseur), aucun appel réseau.
 */

import type { DayPlan, Phase } from "@brasso/core";
import { Check } from "lucide-react";

import { PHASE_LABELS } from "@/features/day/labels";

/** Phases distinctes du plan, dans leur ordre d'apparition. */
function distinctPhases(plan: DayPlan): Phase[] {
  const seen = new Set<Phase>();
  const phases: Phase[] = [];
  for (const step of plan) {
    if (!seen.has(step.phase)) {
      seen.add(step.phase);
      phases.push(step.phase);
    }
  }
  return phases;
}

/**
 * @param plan  plan complet de la session
 * @param cursor index de l'étape courante (`=== plan.length` quand terminé)
 */
export function PhaseProgress({ plan, cursor }: { plan: DayPlan; cursor: number }) {
  const phases = distinctPhases(plan);
  const finished = cursor >= plan.length;
  const currentPhase = finished ? null : (plan[cursor]?.phase ?? null);
  // Rang de la phase courante dans la séquence ; hors plan (terminé) → tout franchi.
  const currentIndex = currentPhase ? phases.indexOf(currentPhase) : phases.length;

  return (
    <ol
      className="flex w-full flex-wrap items-center justify-center gap-x-1 gap-y-2"
      aria-label="Progression des phases"
    >
      {phases.map((phase, i) => {
        const done = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={phase} className="flex items-center gap-1">
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={[
                "flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-sm",
                isCurrent
                  ? "bg-primary/15 font-medium text-foreground ring-1 ring-primary"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/60",
              ].join(" ")}
            >
              {done ? (
                <Check className="size-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={[
                    "size-2 shrink-0 rounded-full",
                    isCurrent ? "bg-primary" : "bg-muted-foreground/40",
                  ].join(" ")}
                />
              )}
              {PHASE_LABELS[phase]}
            </span>
            {i < phases.length - 1 ? (
              <span aria-hidden="true" className="text-muted-foreground/40">
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
