/**
 * Calculateur d'**eau** (M8-02) — UI du cœur `computeWaterPlan` ({{M8-01}}, FORMULES §6).
 * Empâtage + rinçage + température de chauffe, à partir d'une saisie manuelle. Recalcul
 * synchrone, aucune persistance ni réseau.
 */

import { computeWaterPlan, waterPlanInputSchema } from "@brasso/core";
import { useState } from "react";

import { invalidFieldLabels, WATER_LABELS } from "@/features/calculators/labels";
import {
  CalcSection,
  fmt1,
  InvalidHint,
  NumberField,
  parseNum,
  ResultRow,
} from "@/features/calculators/shared";

export function WaterCalculator() {
  const [grainKg, setGrainKg] = useState("5");
  const [mashRatioLPerKg, setMashRatio] = useState("3");
  const [boilVolumeL, setBoilVolume] = useState("30");
  const [deadSpaceL, setDeadSpace] = useState("0");
  const [targetTempC, setTargetTemp] = useState("67");
  const [grainTempC, setGrainTemp] = useState("20");

  const parsed = waterPlanInputSchema.safeParse({
    grainKg: parseNum(grainKg),
    mashRatioLPerKg: parseNum(mashRatioLPerKg),
    boilVolumeL: parseNum(boilVolumeL),
    deadSpaceL: parseNum(deadSpaceL),
    targetTempC: parseNum(targetTempC),
    grainTempC: parseNum(grainTempC),
  });
  const result = parsed.success ? computeWaterPlan(parsed.data) : null;

  return (
    <CalcSection
      title="Eau — empâtage & rinçage"
      description="Volumes d'empâtage et de rinçage et température de chauffe pour atteindre le palier visé."
      inputs={
        <>
          <NumberField
            id="water-grain"
            label={WATER_LABELS.grainKg.label}
            unit={WATER_LABELS.grainKg.unit}
            value={grainKg}
            onChange={setGrainKg}
            step="0.1"
          />
          <NumberField
            id="water-ratio"
            label={WATER_LABELS.mashRatioLPerKg.label}
            unit={WATER_LABELS.mashRatioLPerKg.unit}
            value={mashRatioLPerKg}
            onChange={setMashRatio}
            step="0.1"
          />
          <NumberField
            id="water-boil"
            label={WATER_LABELS.boilVolumeL.label}
            unit={WATER_LABELS.boilVolumeL.unit}
            value={boilVolumeL}
            onChange={setBoilVolume}
          />
          <NumberField
            id="water-deadspace"
            label={WATER_LABELS.deadSpaceL.label}
            unit={WATER_LABELS.deadSpaceL.unit}
            value={deadSpaceL}
            onChange={setDeadSpace}
            step="0.1"
          />
          <NumberField
            id="water-target"
            label={WATER_LABELS.targetTempC.label}
            unit={WATER_LABELS.targetTempC.unit}
            value={targetTempC}
            onChange={setTargetTemp}
          />
          <NumberField
            id="water-graintemp"
            label={WATER_LABELS.grainTempC.label}
            unit={WATER_LABELS.grainTempC.unit}
            value={grainTempC}
            onChange={setGrainTemp}
          />
        </>
      }
      result={
        result ? (
          <>
            <ResultRow label="Eau d'empâtage" value={fmt1(result.mashWaterL)} hint="L" />
            <ResultRow
              label="Eau de rinçage"
              value={fmt1(Math.max(0, result.spargeWaterL))}
              hint="L"
            />
            <ResultRow label="Eau totale" value={fmt1(result.totalWaterL)} hint="L" strong />
            <ResultRow label="Température de chauffe" value={fmt1(result.strikeTempC)} hint="°C" />
            {result.spargeWaterL <= 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                L'empâtage couvre déjà le volume visé : pas de rinçage nécessaire.
              </p>
            ) : null}
          </>
        ) : (
          <InvalidHint
            fields={parsed.success ? [] : invalidFieldLabels(parsed.error, WATER_LABELS)}
          />
        )
      }
    />
  );
}
