import { FOOD_SAFETY_DISCLAIMER, type PhStatus, type SoftResult } from "@brasso/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

/**
 * Libellés des statuts pH — **descriptifs**, jamais un verdict « conforme »/« sûr »
 * (ADR-11). `acidic` = sous le seuil 4,6 ; `low_acid` = au-dessus, zone de vigilance.
 */
const PH_STATUS: Record<PhStatus, string> = {
  acidic: "Sous le seuil 4,6",
  low_acid: "Au-dessus du seuil 4,6 — zone de vigilance",
};

interface IndicatorPanelProps {
  /** Sortie de `computeSoftDrink` (indicateurs sucre / pH / stabilisation). */
  result: SoftResult;
}

/**
 * Panneau d'indicateurs SOFT_DRINK (ADR-11) : concentration en sucre, indicateur pH,
 * rappel de stabilisation, disclaimer permanent. Pas d'ABV/IBU/EBC (aucun grist ni
 * fermentation). Toutes les sorties proviennent de `computeSoftDrink` — aucune
 * formule réécrite ici.
 */
export function IndicatorPanel({ result }: IndicatorPanelProps) {
  const { sugarConcentrationGPerL, ph, stabilizationRequired } = result;

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-lg">Indicateurs</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Concentration en sucre. */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-muted-foreground">Concentration en sucre</span>
          <span
            data-testid="soft-sugar"
            className="font-mono text-xl font-semibold tabular-nums text-foreground"
          >
            {sugarConcentrationGPerL === null ? "—" : `${sugarConcentrationGPerL} g/L`}
          </span>
        </div>

        {/* Indicateur pH. */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Indicateur pH</h3>
          {ph === null ? (
            <p className="text-sm text-muted-foreground">
              Renseigne un pH cible pour afficher l'indicateur.
            </p>
          ) : (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                ph.status === "low_acid"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <span className="font-mono text-base font-semibold text-foreground">pH {ph.ph}</span>{" "}
              — <span data-testid="soft-ph-status">{PH_STATUS[ph.status]}</span>
            </div>
          )}
        </section>

        {/* Rappel de stabilisation : stockage ambiant à pH > 4,6. */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">Indicateur — stabilisation</h3>
          {stabilizationRequired ? (
            <p
              role="alert"
              data-testid="soft-stabilization"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
            >
              Stockage à température ambiante à pH au-dessus du seuil : une stabilisation est
              nécessaire (indicateur d'aide à la décision).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pas de rappel de stabilisation dans ces hypothèses (froid, ou pH sous le seuil).
            </p>
          )}
        </section>

        <p
          data-testid="soft-disclaimer"
          className="border-t border-border pt-4 text-xs text-muted-foreground"
        >
          {FOOD_SAFETY_DISCLAIMER}
        </p>
      </CardContent>
    </Card>
  );
}
