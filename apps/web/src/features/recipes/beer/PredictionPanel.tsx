import type { BeerResult, BjcpStyle } from "@brasso/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

import { StyleGauge } from "./StyleGauge";

const sg = (v: number): string => v.toFixed(3);
const one = (v: number): string => v.toFixed(1);
const int = (v: number): string => Math.round(v).toString();

interface PredictionPanelProps {
  /** Résultat `computeBeer`, ou `null` si la recette n'est pas calculable (volume ≤ 0). */
  result: BeerResult | null;
  /** Style BJCP résolu (bornes des jauges), si sélectionné. */
  style?: BjcpStyle;
}

/**
 * Panneau de prévision temps réel : OG / FG / ABV / IBU / EBC issus de
 * `computeBeer` (`@brasso/core`) + pastille couleur `ebcToHex` + jauges BJCP.
 * Aucune valeur n'est saisie ni stockée : tout est dérivé des intrants.
 */
export function PredictionPanel({ result, style }: PredictionPanelProps) {
  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-lg">Prévision</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {result === null ? (
          <p className="text-sm text-muted-foreground">
            Renseigne un volume cible pour afficher les prévisions.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span
                className="size-10 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: result.colorHex }}
                aria-hidden="true"
              />
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Couleur estimée</span>
                <span className="font-mono text-sm text-foreground">{result.colorHex}</span>
              </div>
              <div className="ml-auto flex flex-col items-end">
                <span className="text-sm text-muted-foreground">ABV</span>
                <span
                  data-testid="metric-abv"
                  className="font-mono text-xl font-semibold tabular-nums text-foreground"
                >
                  {one(result.abv)} %
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <StyleGauge
                label="Densité initiale (OG)"
                testId="metric-og"
                display={sg(result.og)}
                value={result.og}
                min={style?.ogMin}
                max={style?.ogMax}
                status={result.bjcp.og}
              />
              <StyleGauge
                label="Densité finale (FG)"
                testId="metric-fg"
                display={sg(result.fg)}
                value={result.fg}
                min={style?.fgMin}
                max={style?.fgMax}
                status={result.bjcp.fg}
              />
              <StyleGauge
                label="Amertume (IBU)"
                testId="metric-ibu"
                display={int(result.ibu)}
                value={result.ibu}
                min={style?.ibuMin}
                max={style?.ibuMax}
                status={result.bjcp.ibu}
              />
              <StyleGauge
                label="Couleur (EBC)"
                testId="metric-ebc"
                display={one(result.ebc)}
                value={result.ebc}
                min={style?.ebcMin}
                max={style?.ebcMax}
                status={result.bjcp.ebc}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
