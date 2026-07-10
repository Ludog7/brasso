import { Loader2 } from "lucide-react";

import { useBatchMeasures } from "@/features/batches/hooks";
import type { BatchMeasure, MeasureType } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

import { type TimePoint, TimeSeriesChart } from "./TimeSeriesChart";

/** Extrait une série (type donné) triée chronologiquement depuis les mesures. */
function series(measures: BatchMeasure[], type: MeasureType): TimePoint[] {
  return measures
    .filter((m) => m.type === type)
    .map((m) => ({ t: new Date(m.loggedAt).getTime(), y: m.value }))
    .sort((a, b) => a.t - b.t);
}

const formatGravity = (y: number): string => y.toFixed(3);
const formatTemperature = (y: number): string => y.toFixed(1);

/**
 * Graphes de suivi du batch (M3-10) : courbes densité + température dérivées du
 * journal de mesures (M3-06). Utilise le même query TanStack que le journal, donc
 * les courbes se retracent à chaque mesure ajoutée (invalidation M3-09). Deux
 * graphes séparés (échelles incommensurables → jamais de double axe).
 */
export function FermentationCharts({ batchId }: { batchId: string }) {
  const measures = useBatchMeasures(batchId);

  const gravity = measures.data ? series(measures.data, "GRAVITY") : [];
  const temperature = measures.data ? series(measures.data, "TEMPERATURE") : [];
  const total = gravity.length + temperature.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Suivi de fermentation</CardTitle>
      </CardHeader>
      <CardContent>
        {measures.isPending ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <span>Chargement des courbes…</span>
          </div>
        ) : measures.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Impossible de charger les courbes de suivi.
          </p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune mesure enregistrée. Ajoute une mesure de densité ou de température dans le
            journal ci-dessous pour voir les courbes se tracer.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            <TimeSeriesChart
              title="Densité"
              unit="SG"
              color="var(--chart-gravity)"
              points={gravity}
              formatValue={formatGravity}
              emptyHint="Aucune mesure de densité pour l'instant."
            />
            <TimeSeriesChart
              title="Température"
              unit="°C"
              color="var(--chart-temperature)"
              points={temperature}
              formatValue={formatTemperature}
              emptyHint="Aucune mesure de température pour l'instant."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
