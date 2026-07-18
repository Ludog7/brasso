/**
 * Cycle post-ensemencement d'un brassin (M9-10 §B) : frise des jalons datés et
 * synthèse des volumes.
 *
 * Les trois états d'un jalon — achevé, en cours, à venir — sont distingués par
 * **l'icône et le texte** autant que par la couleur : la couleur seule ne suffit
 * pas (accessibilité AA, §6), et l'écran se lit à distance sur une tablette
 * d'atelier.
 */

import { Check, CircleDashed, Loader2, PlayCircle } from "lucide-react";

import type { BatchMilestone, BatchVolumes, VolumeStep } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

import { useBatchMilestones, useBatchVolumes } from "./hooks";
import { MILESTONE_LABELS } from "./labels";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

function formatDate(isoDate: string | null): string {
  if (isoDate === null) return "—";
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  return dateFmt.format(new Date(year, month - 1, day));
}

/** État d'un jalon dans la frise : le premier non achevé est « en cours ». */
type MilestoneState = "done" | "current" | "upcoming";

function statesOf(milestones: readonly BatchMilestone[]): MilestoneState[] {
  let currentFound = false;
  return milestones.map((m) => {
    if (m.completed) return "done";
    if (!currentFound) {
      currentFound = true;
      return "current";
    }
    return "upcoming";
  });
}

const STATE_LABELS: Record<MilestoneState, string> = {
  done: "Terminé",
  current: "En cours",
  upcoming: "À venir",
};

const STATE_TONE: Record<MilestoneState, "success" | "accent" | "muted"> = {
  done: "success",
  current: "accent",
  upcoming: "muted",
};

function StateIcon({ state }: { state: MilestoneState }) {
  if (state === "done") return <Check className="size-5 text-emerald-300" aria-hidden="true" />;
  if (state === "current") return <PlayCircle className="size-5 text-primary" aria-hidden="true" />;
  return <CircleDashed className="size-5 text-muted-foreground" aria-hidden="true" />;
}

/** Un volume de la chaîne : la valeur **et** sa nature (relevée ou déduite). */
function VolumeRow({ label, step }: { label: string; step: VolumeStep }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      {step.volumeL === null ? (
        <span className="text-muted-foreground">Non renseigné</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="font-medium">{step.volumeL} L</span>
          {/* Un volume relevé et un volume déduit n'ont pas la même valeur de
              preuve (FORMULES §13.2) — l'écran doit pouvoir le dire. */}
          <Badge tone={step.source === "measured" ? "success" : "muted"}>
            {step.source === "measured" ? "Mesuré" : "Estimé"}
          </Badge>
        </span>
      )}
    </div>
  );
}

/** Frise des jalons datés du cycle. */
export function MilestonesTimeline({ batchId }: { batchId: string }) {
  const milestones = useBatchMilestones(batchId);

  if (milestones.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement du cycle…
      </p>
    );
  }
  if (milestones.isError) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        Impossible de charger les jalons du cycle.
      </p>
    );
  }
  if (milestones.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun jalon : le cycle démarre à la validation de l&apos;ensemencement.
      </p>
    );
  }

  const states = statesOf(milestones.data);
  return (
    <ol className="grid gap-3">
      {milestones.data.map((milestone, index) => {
        const state = states[index] ?? "upcoming";
        return (
          <li key={milestone.id} className="flex min-h-12 items-start gap-3">
            <StateIcon state={state} />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {MILESTONE_LABELS[milestone.kind] ?? milestone.kind}
                </span>
                <Badge tone={STATE_TONE[state]}>{STATE_LABELS[state]}</Badge>
                <span className="text-sm text-muted-foreground">
                  {milestone.plannedDurationDays} j
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Prévu du {formatDate(milestone.plannedStartDate)} au{" "}
                {formatDate(milestone.plannedEndDate)}
                {milestone.actualEndDate !== null
                  ? ` · terminé le ${formatDate(milestone.actualEndDate)}`
                  : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Chaîne des volumes et rendement de conditionnement. */
export function VolumesSummary({ batchId }: { batchId: string }) {
  const volumes = useBatchVolumes(batchId);

  if (volumes.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement des volumes…
      </p>
    );
  }
  if (volumes.isError) {
    return (
      <p role="alert" className="text-sm text-destructive-foreground">
        Impossible de charger les volumes.
      </p>
    );
  }

  const data: BatchVolumes = volumes.data;
  return (
    <div className="text-sm">
      <VolumeRow label="Pré-ébullition" step={data.preBoil} />
      <VolumeRow label="Post-ébullition" step={data.postBoil} />
      <VolumeRow label="Transféré" step={data.transferred} />
      <VolumeRow label="Ensemencé" step={data.pitched} />
      <VolumeRow label="Conditionné" step={data.packaged} />

      <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-3">
        <span className="text-muted-foreground">Rendement de conditionnement</span>
        <span className="font-medium">
          {data.packagingYieldPercent === null
            ? "Non calculable"
            : `${data.packagingYieldPercent.toFixed(1)} %`}
        </span>
      </div>

      {data.warnings.map((warning) => (
        <p key={warning} role="alert" className="mt-2 text-destructive-foreground">
          {warning}
        </p>
      ))}
    </div>
  );
}

/** Panneau « Cycle du brassin » : frise des jalons + volumes. */
export function CyclePanel({ batchId }: { batchId: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Cycle du brassin</CardTitle>
        </CardHeader>
        <CardContent>
          <MilestonesTimeline batchId={batchId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Volumes</CardTitle>
        </CardHeader>
        <CardContent>
          <VolumesSummary batchId={batchId} />
        </CardContent>
      </Card>
    </div>
  );
}
