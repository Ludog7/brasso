/**
 * Calculateur **BIAB** (M8-02) — UI du cœur `computeBiab` ({{M8-01}}, FORMULES §12.2).
 * Brassage une seule cuve, sans rinçage : eau totale, ratio et température de chauffe.
 * Recalcul synchrone, aucune persistance ni réseau.
 */

import { biabInputSchema, computeBiab } from "@brasso/core";
import { useState } from "react";

import { BIAB_LABELS, invalidFieldLabels } from "@/features/calculators/labels";
import {
  CalcSection,
  fmt1,
  InvalidHint,
  NumberField,
  parseNum,
  ResultRow,
} from "@/features/calculators/shared";

export function BiabCalculator() {
  const [grainKg, setGrainKg] = useState("5");
  const [boilVolumeL, setBoilVolume] = useState("30");
  const [deadSpaceL, setDeadSpace] = useState("0");
  const [grainAbsorptionLPerKg, setAbsorption] = useState("1.0");
  const [targetTempC, setTargetTemp] = useState("67");
  const [grainTempC, setGrainTemp] = useState("20");

  const parsed = biabInputSchema.safeParse({
    grainKg: parseNum(grainKg),
    boilVolumeL: parseNum(boilVolumeL),
    deadSpaceL: parseNum(deadSpaceL),
    grainAbsorptionLPerKg: parseNum(grainAbsorptionLPerKg),
    targetTempC: parseNum(targetTempC),
    grainTempC: parseNum(grainTempC),
  });
  const result = parsed.success ? computeBiab(parsed.data) : null;

  return (
    <CalcSection
      title="BIAB — une seule cuve"
      description="Eau totale (toute dans la cuve, sans rinçage), ratio d'empâtage et température de chauffe."
      inputs={
        <>
          <NumberField
            id="biab-grain"
            label={BIAB_LABELS.grainKg.label}
            unit={BIAB_LABELS.grainKg.unit}
            value={grainKg}
            onChange={setGrainKg}
            step="0.1"
          />
          <NumberField
            id="biab-boil"
            label={BIAB_LABELS.boilVolumeL.label}
            unit={BIAB_LABELS.boilVolumeL.unit}
            value={boilVolumeL}
            onChange={setBoilVolume}
          />
          <NumberField
            id="biab-deadspace"
            label={BIAB_LABELS.deadSpaceL.label}
            unit={BIAB_LABELS.deadSpaceL.unit}
            value={deadSpaceL}
            onChange={setDeadSpace}
            step="0.1"
          />
          <NumberField
            id="biab-absorption"
            label={BIAB_LABELS.grainAbsorptionLPerKg.label}
            unit={BIAB_LABELS.grainAbsorptionLPerKg.unit}
            value={grainAbsorptionLPerKg}
            onChange={setAbsorption}
            step="0.1"
          />
          <NumberField
            id="biab-target"
            label={BIAB_LABELS.targetTempC.label}
            unit={BIAB_LABELS.targetTempC.unit}
            value={targetTempC}
            onChange={setTargetTemp}
          />
          <NumberField
            id="biab-graintemp"
            label={BIAB_LABELS.grainTempC.label}
            unit={BIAB_LABELS.grainTempC.unit}
            value={grainTempC}
            onChange={setGrainTemp}
          />
        </>
      }
      result={
        result ? (
          <>
            <ResultRow label="Eau totale" value={fmt1(result.totalWaterL)} hint="L" strong />
            <ResultRow label="Eau absorbée" value={fmt1(result.absorptionL)} hint="L" />
            <ResultRow label="Ratio d'empâtage" value={fmt1(result.mashRatioLPerKg)} hint="L/kg" />
            <ResultRow label="Température de chauffe" value={fmt1(result.strikeTempC)} hint="°C" />
          </>
        ) : (
          <InvalidHint
            fields={parsed.success ? [] : invalidFieldLabels(parsed.error, BIAB_LABELS)}
          />
        )
      }
    />
  );
}
