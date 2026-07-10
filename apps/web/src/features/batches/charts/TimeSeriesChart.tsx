import { useId } from "react";

/** Un relevé daté d'une série (temps epoch ms + valeur brute). */
export interface TimePoint {
  t: number;
  y: number;
}

interface TimeSeriesChartProps {
  /** Titre de la série (nomme la série — pas de légende pour une mono-série). */
  title: string;
  /** Unité affichée sur l'axe et l'en-tête de tableau (ex. « SG », « °C »). */
  unit: string;
  /** Couleur CSS de la courbe (token de thème, ex. `var(--chart-gravity)`). */
  color: string;
  /** Points triés par ordre chronologique croissant. */
  points: TimePoint[];
  /** Mise en forme d'une valeur (nombre nu, sans unité). */
  formatValue: (y: number) => string;
  /** Invite affichée quand la série est vide. */
  emptyHint: string;
}

// Repère logique du SVG (mis à l'échelle en largeur ; hauteur via le ratio).
const VIEW_W = 720;
const VIEW_H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});
const dateAxisFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Bornes verticales auto, avec une marge pour ne pas coller aux axes. */
function yDomain(points: TimePoint[]): { min: number; max: number } {
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min;
  const pad = range > 0 ? range * 0.12 : Math.abs(max) * 0.05 || 1;
  return { min: min - pad, max: max + pad };
}

/**
 * Graphe SVG maison d'une série temporelle (M3-10) : léger, sans dépendance de
 * charting. Courbe + points marqués, axes datés à bornes auto, un seul label
 * direct (dernier relevé). Accessible : `<figure>` nommée, `role="img"` résumé,
 * et repli `<details>`/tableau listant tous les points (jamais dataviz-only).
 */
export function TimeSeriesChart({
  title,
  unit,
  color,
  points,
  formatValue,
  emptyHint,
}: TimeSeriesChartProps) {
  const captionId = useId();

  if (points.length === 0) {
    return (
      <figure className="m-0 flex flex-col gap-2" aria-labelledby={captionId}>
        <Caption id={captionId} title={title} unit={unit} />
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      </figure>
    );
  }

  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const { min: yMin, max: yMax } = yDomain(points);

  const xOf = (t: number): number =>
    tMax === tMin ? PAD.left + PLOT_W / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * PLOT_W;
  const yOf = (y: number): number =>
    yMax === yMin ? PAD.top + PLOT_H / 2 : PAD.top + (1 - (y - yMin) / (yMax - yMin)) * PLOT_H;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t)},${yOf(p.y)}`).join(" ");
  const gridValues = [yMax, (yMax + yMin) / 2, yMin];
  const last = points[points.length - 1]!;

  const summary =
    `${title} : ${points.length} relevé${points.length > 1 ? "s" : ""}, ` +
    `de ${formatValue(points[0]!.y)} à ${formatValue(last.y)} ${unit} ` +
    `(dernier le ${dateTimeFmt.format(new Date(last.t))}).`;

  return (
    <figure className="m-0 flex flex-col gap-2" aria-labelledby={captionId}>
      <Caption id={captionId} title={title} unit={unit} />

      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
        style={{ color }}
      >
        {/* Grille récessive + graduations verticales. */}
        {gridValues.map((v, i) => {
          const y = yOf(v);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={13}
                fill="var(--color-muted-foreground)"
              >
                {formatValue(v)}
              </text>
            </g>
          );
        })}

        {/* Dates extrêmes en abscisse (labels sélectifs, pas un par point). */}
        <text
          x={PAD.left}
          y={VIEW_H - 8}
          textAnchor="start"
          fontSize={13}
          fill="var(--color-muted-foreground)"
        >
          {dateAxisFmt.format(new Date(tMin))}
        </text>
        {tMax !== tMin ? (
          <text
            x={VIEW_W - PAD.right}
            y={VIEW_H - 8}
            textAnchor="end"
            fontSize={13}
            fill="var(--color-muted-foreground)"
          >
            {dateAxisFmt.format(new Date(tMax))}
          </text>
        ) : null}

        {/* Courbe. */}
        {points.length > 1 ? (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Points marqués, avec anneau de surface pour les chevauchements. */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xOf(p.t)}
            cy={yOf(p.y)}
            r={4}
            fill="currentColor"
            stroke="var(--color-card)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Label direct : dernier relevé uniquement. */}
        <text
          x={xOf(last.t) - 8}
          y={yOf(last.y) - 10}
          textAnchor="end"
          fontSize={13}
          fontWeight={600}
          fill="currentColor"
        >
          {formatValue(last.y)}
        </text>
      </svg>

      {/* Repli accessible : toutes les valeurs en clair (pas de dataviz-only). */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Afficher les valeurs ({points.length})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Date</th>
                <th className="py-1 font-medium">
                  {title} ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1 pr-4 whitespace-nowrap text-muted-foreground">
                    {dateTimeFmt.format(new Date(p.t))}
                  </td>
                  <td className="py-1 font-medium">{formatValue(p.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Caption({ id, title, unit }: { id: string; title: string; unit: string }) {
  return (
    <figcaption id={id} className="flex items-baseline justify-between">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </figcaption>
  );
}
