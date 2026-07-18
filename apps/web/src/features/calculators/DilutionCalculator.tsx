/**
 * Calculateur de **dilution** (M8-02) — UI du cœur `dilutionWaterToTarget` ({{M8-01}},
 * FORMULES §9.3). Eau à ajouter pour abaisser la densité jusqu'à une cible. Recalcul
 * synchrone, aucune persistance ni réseau. La cible doit rester < densité actuelle.
 */

import { dilutionToTargetInputSchema, dilutionWaterToTarget } from "@brasso/core";
import { useState } from "react";

import { DILUTION_LABELS, invalidFieldLabels } from "@/features/calculators/labels";
import {
  CalcSection,
  fmt1,
  InvalidHint,
  NumberField,
  parseNum,
  ResultRow,
} from "@/features/calculators/shared";

export function DilutionCalculator() {
  const [currentSg, setCurrentSg] = useState("1.060");
  const [currentVolumeL, setCurrentVolume] = useState("20");
  const [targetSg, setTargetSg] = useState("1.050");

  const parsed = dilutionToTargetInputSchema.safeParse({
    currentSg: parseNum(currentSg),
    currentVolumeL: parseNum(currentVolumeL),
    targetSg: parseNum(targetSg),
  });

  // Le schéma valide les bornes SG mais pas « cible < actuelle » : `dilutionWaterToTarget`
  // lève `RangeError` (l'ajout d'eau ne fait que diluer) — on le capte pour ne pas planter.
  let result: { finalVolumeL: number; waterToAddL: number } | null = null;
  let rangeMessage: string | null = null;
  if (parsed.success) {
    try {
      result = dilutionWaterToTarget(parsed.data);
    } catch {
      rangeMessage = "La densité cible doit être inférieure à la densité actuelle.";
    }
  }

  return (
    <CalcSection
      title="Dilution vers une densité cible"
      description="Volume d'eau à ajouter pour abaisser la densité d'un moût trop concentré."
      inputs={
        <>
          <NumberField
            id="dilution-current-sg"
            label={DILUTION_LABELS.currentSg.label}
            unit={DILUTION_LABELS.currentSg.unit}
            value={currentSg}
            onChange={setCurrentSg}
            step="0.001"
          />
          <NumberField
            id="dilution-volume"
            label={DILUTION_LABELS.currentVolumeL.label}
            unit={DILUTION_LABELS.currentVolumeL.unit}
            value={currentVolumeL}
            onChange={setCurrentVolume}
          />
          <NumberField
            id="dilution-target-sg"
            label={DILUTION_LABELS.targetSg.label}
            unit={DILUTION_LABELS.targetSg.unit}
            value={targetSg}
            onChange={setTargetSg}
            step="0.001"
          />
        </>
      }
      result={
        result ? (
          <>
            <ResultRow label="Eau à ajouter" value={fmt1(result.waterToAddL)} hint="L" strong />
            <ResultRow label="Volume final" value={fmt1(result.finalVolumeL)} hint="L" />
          </>
        ) : rangeMessage ? (
          <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
            {rangeMessage}
          </p>
        ) : (
          <InvalidHint
            fields={parsed.success ? [] : invalidFieldLabels(parsed.error, DILUTION_LABELS)}
          />
        )
      }
    />
  );
}
