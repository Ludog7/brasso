import type { AltResult, PhStatus, StorageMode } from "@brasso/core";

import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Select } from "@/ui/select";

import { RowField } from "../beer/RowField";
import type { AltEstimationInputs } from "./mapToEngine";

const one = (v: number): string => v.toFixed(1);

/**
 * Libellés des statuts pH — **descriptifs**, jamais un verdict « conforme »/« sûr »
 * (ADR-11). `acidic` = sous le seuil 4,6 ; `low_acid` = au-dessus, zone de vigilance.
 */
const PH_STATUS: Record<PhStatus, string> = {
  acidic: "Sous le seuil 4,6",
  low_acid: "Au-dessus du seuil 4,6 — zone de vigilance",
};

interface IndicatorPanelProps {
  /** Sortie de `computeAltFermented` (indicateurs + disclaimer). */
  result: AltResult;
  /** L'utilisateur a-t-il saisi des densités → afficher ABV/atténuation ? */
  hasGravities: boolean;
  estimation: AltEstimationInputs;
  disabled?: boolean;
  onEstimationChange: (patch: Partial<AltEstimationInputs>) => void;
}

/**
 * Panneau d'indicateurs ALT_FERMENTED (ADR-11) : ABV/atténuation **estimés**,
 * indicateur pH, indicateur de risque de carbonatation, disclaimer permanent.
 * IBU/EBC volontairement absents (grist non pertinent). Toutes les sorties
 * proviennent de `computeAltFermented` — aucune formule réécrite ici.
 *
 * Les hypothèses d'estimation (densités, conservation) sont saisies ici et **non
 * persistées** : `RecipeAltDetails` ne les stocke pas (schéma M2-01).
 */
export function IndicatorPanel({
  result,
  hasGravities,
  estimation,
  disabled,
  onEstimationChange,
}: IndicatorPanelProps) {
  const { ph, carbonationRisk } = result;

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="text-lg">Indicateurs</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Hypothèses d'estimation — non enregistrées. */}
        <section className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground">
            Hypothèses d'estimation (non enregistrées)
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <RowField label="OG (densité initiale)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="max-w-32"
                value={estimation.og}
                disabled={disabled}
                onChange={(e) => onEstimationChange({ og: e.target.value })}
              />
            </RowField>
            <RowField label="FG (densité finale)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.001"
                className="max-w-32"
                value={estimation.fg}
                disabled={disabled}
                onChange={(e) => onEstimationChange({ fg: e.target.value })}
              />
            </RowField>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <RowField label="Conservation" className="min-w-40">
              <Select
                value={estimation.storageMode}
                disabled={disabled}
                onChange={(e) => onEstimationChange({ storageMode: e.target.value as StorageMode })}
              >
                <option value="ambient">Température ambiante</option>
                <option value="cold">Chaîne du froid</option>
              </Select>
            </RowField>
            <RowField label="Temp. max atteinte (°C)">
              <Input
                type="number"
                inputMode="decimal"
                className="max-w-32"
                value={estimation.maxTempC}
                disabled={disabled}
                onChange={(e) => onEstimationChange({ maxTempC: e.target.value })}
              />
            </RowField>
          </div>
        </section>

        {/* ABV / atténuation estimés (densités requises). */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">ABV estimé</span>
            <span
              data-testid="alt-abv"
              className="font-mono text-xl font-semibold tabular-nums text-foreground"
            >
              {hasGravities ? `${one(result.abv)} %` : "—"}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm text-muted-foreground">Atténuation</span>
            <span
              data-testid="alt-attenuation"
              className="font-mono text-xl font-semibold tabular-nums text-foreground"
            >
              {hasGravities ? `${one(result.attenuation)} %` : "—"}
            </span>
          </div>
        </div>
        {!hasGravities ? (
          <p className="-mt-3 text-xs text-muted-foreground">
            Renseigne OG et FG pour estimer l'ABV et l'atténuation.
          </p>
        ) : null}

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
              — <span data-testid="alt-ph-status">{PH_STATUS[ph.status]}</span>
            </div>
          )}
        </section>

        {/* Indicateur risque de carbonatation. */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">
            Indicateur — risque de carbonatation
          </h3>
          {carbonationRisk.residualCo2 !== null ? (
            <p className="text-sm text-muted-foreground">
              CO₂ résiduel estimé :{" "}
              <span className="font-mono text-foreground">
                {one(carbonationRisk.residualCo2)} vol
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Renseigne la température max atteinte pour estimer le CO₂ résiduel.
            </p>
          )}
          {carbonationRisk.atRisk ? (
            <p
              role="alert"
              data-testid="alt-carbonation-risk"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
            >
              Risque de surpression en bouteille : sucre résiduel fermentescible, sans
              stabilisation, conservé à température ambiante.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pas de risque de surpression identifié dans ces hypothèses.
            </p>
          )}
        </section>

        <p
          data-testid="alt-disclaimer"
          className="border-t border-border pt-4 text-xs text-muted-foreground"
        >
          {carbonationRisk.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}
