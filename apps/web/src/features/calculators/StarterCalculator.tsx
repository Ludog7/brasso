/**
 * Calculateur de **starter / levure** (M8-02) — UI du cœur `computeStarter` ({{M8-01}},
 * FORMULES §12.1). Saisie manuelle, recalcul synchrone, aucune persistance ni réseau.
 *
 * Wording **ADR-11** : « estimation / aide à la décision ». Le besoin réel dépend de
 * l'oxygénation et de la souche ; l'outil éclaire, le brasseur décide.
 */

import { computeStarter, starterInputSchema } from "@brasso/core";
import { useState } from "react";

import { invalidFieldLabels, STARTER_LABELS } from "@/features/calculators/labels";
import {
  CalcSection,
  fmt0,
  fmt1,
  fmt3,
  InvalidHint,
  NumberField,
  parseNum,
  ResultRow,
} from "@/features/calculators/shared";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

export function StarterCalculator() {
  const [og, setOg] = useState("1.048");
  const [volumeL, setVolumeL] = useState("20");
  const [style, setStyle] = useState<"ale" | "lager">("ale");
  const [pitchRate, setPitchRate] = useState("");
  const [packs, setPacks] = useState("1");
  const [cellsPerPackB, setCellsPerPackB] = useState("100");
  const [viability, setViability] = useState("1");

  const parsed = starterInputSchema.safeParse({
    og: parseNum(og),
    volumeL: parseNum(volumeL),
    style,
    pitchRate: parseNum(pitchRate),
    packs: parseNum(packs),
    cellsPerPackB: parseNum(cellsPerPackB),
    viability: parseNum(viability),
  });
  const result = parsed.success ? computeStarter(parsed.data) : null;

  return (
    <CalcSection
      title="Starter / levure"
      description="Cellules requises pour ensemencer correctement le moût et taille de pied de cuve recommandée."
      inputs={
        <>
          <NumberField
            id="starter-og"
            label={STARTER_LABELS.og.label}
            unit={STARTER_LABELS.og.unit}
            value={og}
            onChange={setOg}
            step="0.001"
          />
          <NumberField
            id="starter-volume"
            label={STARTER_LABELS.volumeL.label}
            unit={STARTER_LABELS.volumeL.unit}
            value={volumeL}
            onChange={setVolumeL}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="starter-style">{STARTER_LABELS.style.label}</Label>
            <Select
              id="starter-style"
              value={style}
              onChange={(event) => setStyle(event.target.value as "ale" | "lager")}
            >
              <option value="ale">Ale (0,75 M/mL/°P)</option>
              <option value="lager">Lager (1,5 M/mL/°P)</option>
            </Select>
          </div>
          <NumberField
            id="starter-pitchrate"
            label={STARTER_LABELS.pitchRate.label}
            unit={STARTER_LABELS.pitchRate.unit}
            value={pitchRate}
            onChange={setPitchRate}
            step="0.05"
          />
          <NumberField
            id="starter-packs"
            label={STARTER_LABELS.packs.label}
            unit={STARTER_LABELS.packs.unit}
            value={packs}
            onChange={setPacks}
          />
          <NumberField
            id="starter-cells"
            label={STARTER_LABELS.cellsPerPackB.label}
            unit={STARTER_LABELS.cellsPerPackB.unit}
            value={cellsPerPackB}
            onChange={setCellsPerPackB}
          />
          <NumberField
            id="starter-viability"
            label={STARTER_LABELS.viability.label}
            unit={STARTER_LABELS.viability.unit}
            value={viability}
            onChange={setViability}
            step="0.05"
          />
        </>
      }
      result={
        result ? (
          <>
            <ResultRow label="Moût" value={fmt1(result.platoOfWort)} hint="°P" />
            <ResultRow label="Taux retenu" value={fmt3(result.pitchRate)} hint="M/mL/°P" />
            <ResultRow label="Cellules requises" value={fmt0(result.cellsRequiredB)} hint="×10⁹" />
            <ResultRow
              label="Cellules disponibles"
              value={fmt0(result.cellsAvailableB)}
              hint="×10⁹"
            />
            <ResultRow label="Déficit" value={fmt0(result.deficitB)} hint="×10⁹" />
            <ResultRow
              label="Pied de cuve conseillé"
              value={fmt1(result.recommendedStarterL)}
              hint="L"
              strong
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Estimation d'aide à la décision : la croissance réelle dépend de l'oxygénation et de
              la souche.
            </p>
          </>
        ) : (
          <InvalidHint
            fields={parsed.success ? [] : invalidFieldLabels(parsed.error, STARTER_LABELS)}
          />
        )
      }
    />
  );
}
