import { Loader2 } from "lucide-react";

import { useBatchCost } from "@/features/batches/hooks";
import type { BatchCost, CostBasis } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Centimes (unité interne) → euros formatés fr-FR ; `null`/inconnu → tiret. */
function euros(cents: number | null): string {
  return cents == null ? "—" : eurFmt.format(cents / 100);
}

/** Libellé de la base de valorisation (M5-06). */
const BASIS_LABEL: Record<CostBasis, string> = {
  planned: "Estimation planifiée",
  consumed: "Depuis consommation réelle",
};

/** Une ligne de la répartition : libellé, montant, part du total (pour la barre). */
function Breakdown({
  label,
  cents,
  totalCents,
}: {
  label: string;
  cents: number;
  totalCents: number;
}) {
  const pct = totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{euros(cents)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

/**
 * Panneau « Coût de revient » de la fiche batch (M5-08). Affiche le total, le coût
 * au litre et la répartition ingrédients / conditionnement / bulk depuis
 * `GET /api/batches/:id/cost`. Montants **estimés** sur les coûts de référence du
 * catalogue — jamais présentés comme exacts (discipline de wording du projet).
 */
export function CostPanel({ batchId }: { batchId: string }) {
  const cost = useBatchCost(batchId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-lg">Coût de revient</CardTitle>
        {cost.data ? <Badge tone="muted">{BASIS_LABEL[cost.data.basis]}</Badge> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cost.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>Calcul du coût…</span>
          </div>
        ) : cost.isError || !cost.data ? (
          <p className="text-sm text-muted-foreground">Coût de revient indisponible.</p>
        ) : (
          <CostBody cost={cost.data} />
        )}
      </CardContent>
    </Card>
  );
}

function CostBody({ cost }: { cost: BatchCost }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Total estimé</span>
          <span className="text-2xl font-semibold tabular-nums">{euros(cost.totalCents)}</span>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-sm text-muted-foreground">Coût au litre</span>
          <span className="text-xl font-semibold tabular-nums">
            {cost.costPerLiterCents == null ? "—" : `${euros(cost.costPerLiterCents)}/L`}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        <Breakdown label="Ingrédients" cents={cost.ingredientsCents} totalCents={cost.totalCents} />
        <Breakdown
          label="Conditionnement"
          cents={cost.conditioningCents}
          totalCents={cost.totalCents}
        />
        <Breakdown label="Bulk (forfait)" cents={cost.bulkCents} totalCents={cost.totalCents} />
      </ul>

      {cost.missingCostLines > 0 ? (
        <p role="note" className="text-sm text-amber-300">
          {cost.missingCostLines} ingrédient{cost.missingCostLines > 1 ? "s" : ""} sans coût de
          référence — total sous-estimé.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Estimation basée sur les coûts de référence du catalogue.
      </p>
    </>
  );
}
