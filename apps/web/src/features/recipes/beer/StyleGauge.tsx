import type { GaugeStatus } from "@brasso/core";

import { cn } from "@/lib/utils";

const STATUS_META: Record<GaugeStatus, { label: string; dot: string; text: string }> = {
  in_range: { label: "dans la plage", dot: "bg-success", text: "text-success" },
  below: { label: "sous la plage", dot: "bg-warning", text: "text-warning" },
  above: { label: "au-dessus", dot: "bg-destructive", text: "text-destructive" },
  unknown: { label: "hors style", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

interface StyleGaugeProps {
  label: string;
  /** Valeur formatée pour l'affichage (ex. « 1.052 »). */
  display: string;
  value: number;
  min?: number;
  max?: number;
  status: GaugeStatus;
  testId?: string;
}

/**
 * Jauge d'une métrique BEER vs plage BJCP : bande cible `[min, max]` + curseur à
 * la valeur calculée. Sans plage (style non sélectionné) → valeur seule, sans
 * jauge (spec M2-06). Statut fourni par `gaugeStatus` de `@brasso/core`.
 */
export function StyleGauge({ label, display, value, min, max, status, testId }: StyleGaugeProps) {
  const meta = STATUS_META[status];
  const hasRange = min !== undefined && max !== undefined && max > min;

  // Domaine d'affichage : englobe la plage et la valeur, avec une marge de 15 %.
  let bandLeft = 0;
  let bandWidth = 0;
  let markerLeft = 0;
  if (hasRange) {
    const lo = Math.min(min, value);
    const hi = Math.max(max, value);
    const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
    const domainMin = lo - pad;
    const domainMax = hi + pad;
    const span = domainMax - domainMin;
    const pct = (v: number) => ((v - domainMin) / span) * 100;
    bandLeft = pct(min);
    bandWidth = pct(max) - pct(min);
    markerLeft = pct(value);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          data-testid={testId}
          className="font-mono text-base font-semibold tabular-nums text-foreground"
        >
          {display}
        </span>
      </div>

      {hasRange ? (
        <>
          <div className="relative h-2 rounded-full bg-muted">
            <div
              className="absolute inset-y-0 rounded-full bg-primary/25"
              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            />
            <div
              className={cn(
                "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background",
                meta.dot,
              )}
              style={{ left: `${Math.max(0, Math.min(100, markerLeft))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="tabular-nums text-muted-foreground">{min}</span>
            <span className={cn("flex items-center gap-1 font-medium", meta.text)}>
              <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
              {meta.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{max}</span>
          </div>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Sélectionne un style pour la jauge</span>
      )}
    </div>
  );
}
