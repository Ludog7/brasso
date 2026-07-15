/**
 * Corrections densité **pré-ébullition** (M4-13, spec « Corrections & décisions »).
 * À la filtration/pré-ébullition, dès que densité **et** volume sont relevés (M4-11),
 * interroge l'aperçu serveur (`POST /day/corrections/preview`, M4-07 → core M4-02) et
 * affiche l'**écart au modèle** puis des propositions **chiffrées** avec impact estimé
 * OG/ABV : prolonger l'ébullition, ajouter du sucre/extrait, ou diluer.
 *
 * Chaque proposition peut être **journalisée** (`POST /day/corrections`) : une trace
 * append-only, sans effet sur la state machine (la décision reste au brasseur).
 *
 * Wording **ADR-11** : « estimation / aide à la décision / aperçu », **jamais**
 * « corrige » / « garantit » / « conforme ». Le brasseur décide ; l'outil éclaire.
 */

import {
  type DayState,
  measurementsForStep,
  type PreBoilProposal,
  type StepSpec,
} from "@brasso/core";
import { Check, FlaskConical, Loader2 } from "lucide-react";
import { useState } from "react";

import { formatMeasurement } from "@/features/day/format";
import { useOnlineStatus, usePreBoilCorrections, useRecordCorrection } from "@/features/day/hooks";
import { DEVIATION_TOLERANCE } from "@/features/day/model";
import type { CorrectionType } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

/** Écart de densité (points) au-delà duquel une correction est mise en avant. */
const DEVIATION_POINTS = DEVIATION_TOLERANCE.density * 1000;

/** Proposition core → type de correction journalisable (enum API). */
const PROPOSAL_TYPE: Record<PreBoilProposal["kind"], CorrectionType> = {
  extend_boil: "EXTEND_BOIL",
  add_sugar: "ADD_SUGAR",
  dilute: "DILUTE",
};

/** Dernières mesures densité **et** volume relevées sur l'étape, ou `null` si incomplètes. */
function preBoilMeasurement(
  state: DayState,
  stepId: string,
): { measuredGravity: number; measuredVolumeL: number } | null {
  let gravity: number | undefined;
  let volume: number | undefined;
  for (const m of measurementsForStep(state, stepId)) {
    if (m.kind === "density") gravity = m.value;
    if (m.kind === "volume") volume = m.value;
  }
  return gravity !== undefined && volume !== undefined
    ? { measuredGravity: gravity, measuredVolumeL: volume }
    : null;
}

/** Libellé de l'action d'une proposition (impact chiffré rendu à part). */
function actionLabel(proposal: PreBoilProposal): string {
  switch (proposal.kind) {
    case "extend_boil":
      return `Prolonger l'ébullition de +${Math.round(proposal.extraBoilMin)} min`;
    case "add_sugar":
      return `Ajouter +${proposal.sugarKg.toFixed(2)} kg de sucre / extrait`;
    case "dilute":
      return `Diluer avec +${proposal.waterToAddL.toFixed(1)} L d'eau`;
  }
}

export function PreBoilCorrections({
  step,
  state,
  batchId,
}: {
  step: StepSpec;
  state: DayState;
  batchId: string;
}) {
  const online = useOnlineStatus();
  const measurement = preBoilMeasurement(state, step.id);
  const preview = usePreBoilCorrections(batchId, online ? measurement : null);
  const record = useRecordCorrection(batchId);
  const [saved, setSaved] = useState<Set<CorrectionType>>(new Set());

  // Le panneau n'apparaît qu'une fois densité + volume pré-ébullition relevés (M4-11).
  if (!measurement) return null;

  const save = (proposal: PreBoilProposal) => {
    const type = PROPOSAL_TYPE[proposal.kind];
    record.mutate(
      { stepId: step.id, type, payload: { ...proposal } },
      { onSuccess: () => setSaved((prev) => new Set(prev).add(type)) },
    );
  };

  return (
    <section
      aria-label="Corrections densité pré-ébullition"
      className="flex w-full max-w-md flex-col gap-3 text-left"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <FlaskConical className="size-4" aria-hidden="true" />
        Corrections densité — aide à la décision
      </h3>
      <p className="text-xs text-muted-foreground">
        Estimations indicatives d'aide à la décision, non prescriptives : à vous de choisir la
        suite.
      </p>

      {!online ? (
        <p className="text-sm text-muted-foreground">
          Aperçu des corrections indisponible hors-ligne.
        </p>
      ) : preview.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Estimation en cours…
        </p>
      ) : preview.isError ? (
        <p className="text-sm text-muted-foreground">
          Aperçu indisponible pour cette recette (cibles du modèle incomplètes).
        </p>
      ) : Math.abs(preview.data.deltaGravity) < DEVIATION_POINTS ||
        preview.data.proposals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Densité pré-ébullition proche du modèle : aucune correction nécessaire.
        </p>
      ) : (
        <>
          <p className="text-sm">
            Densité pré-ébullition mesurée{" "}
            <span className="font-medium tabular-nums">
              {formatMeasurement("density", measurement.measuredGravity)}
            </span>{" "}
            — écart estimé{" "}
            <span className="font-medium tabular-nums">
              {preview.data.deltaGravity >= 0 ? "+" : "−"}
              {Math.abs(preview.data.deltaGravity).toFixed(1)} points
            </span>{" "}
            {preview.data.deltaGravity >= 0 ? "au-dessus" : "en dessous"} du modèle.
          </p>

          <ul className="flex flex-col gap-3">
            {preview.data.proposals.map((proposal) => {
              const type = PROPOSAL_TYPE[proposal.kind];
              const isSaved = saved.has(type);
              return (
                <li
                  key={proposal.kind}
                  className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
                >
                  <span className="font-medium">{actionLabel(proposal)}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    OG estimée ≈ {formatMeasurement("density", proposal.projectedOg)} · ABV estimé ≈{" "}
                    {proposal.projectedAbv.toFixed(1)} %
                  </span>
                  {isSaved ? (
                    <Badge tone="success" role="status" className="self-start">
                      <Check className="mr-1 size-3.5" aria-hidden="true" />
                      Décision enregistrée
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      className="self-start"
                      disabled={record.isPending}
                      onClick={() => save(proposal)}
                    >
                      {record.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Enregistrer la décision
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
