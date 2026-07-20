/**
 * **Mise en condition** des contenants d'un brassin (M9-15, ticket #273) : ce que
 * chaque ligne attend avant d'être vendable, et le relevé de pression qui fait
 * avancer un fût en carbonatation forcée.
 *
 * Cet écran comble un manque : M9-15 calculait déjà la date de mise en vente
 * d'un fût à partir d'un relevé atteignant la cible, mais rien dans
 * l'application ne permettait de faire ce relevé — un fût carbonaté n'était donc
 * jamais annoncé prêt.
 *
 * Trois choix structurants :
 *
 * - **Un relevé en deçà de la cible est conservé et affiché.** Il n'est pas
 *   traité comme un échec : c'est le constat qui dit de combien il faut
 *   réajuster le détendeur avant de relever à nouveau. L'effacer priverait
 *   l'opérateur de la seule information utile.
 * - **La température sert deux fois.** Le même champ alimente l'aide au réglage
 *   (« quelle pression viser ? », avant de toucher au détendeur) et le relevé
 *   (« qu'est-ce que je lis ? »), parce que la cible dépend de la température :
 *   juger une mesure contre la cible d'une autre température validerait une
 *   bière plate (FORMULES §8.2).
 * - **ADR-11** : le verdict dit que la mesure **atteint la cible** — un
 *   indicateur d'aide à la décision. Jamais « conforme », jamais « prêt à la
 *   vente » au sens d'une attestation.
 */

import { AlertTriangle, CheckCircle2, Gauge, Loader2 } from "lucide-react";
import { useId, useState } from "react";

import type {
  CarbonationReadingResult,
  CarbonationTarget,
  ConditioningMethod,
  PackagingLine,
} from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

import { useBatchPackaging, useCarbonationTarget, useRecordCarbonationReading } from "./hooks";

/** Libellés de mise en condition (M9-15) — la ligne, pas le brassin. */
const CONDITIONING_LABELS: Record<ConditioningMethod, string> = {
  NONE: "Aucune mise en condition",
  REFERMENTATION: "Refermentation en bouteille",
  FORCED_CARBONATION: "Carbonatation forcée (fût)",
};

const numFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const barFmt = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** Formate une date calendaire `YYYY-MM-DD` sans la faire glisser d'un fuseau. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  return dateFmt.format(new Date(year, month - 1, day));
}

/** Nombre fini quelconque (une température peut être négative), sinon `null`. */
function finite(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}

/** Nombre fini ≥ 0 — une pression relative ne descend pas sous zéro. */
function nonNegative(raw: string): number | null {
  const value = finite(raw);
  return value !== null && value >= 0 ? value : null;
}

/**
 * Panneau « mise en condition » du brassin : une entrée par contenant
 * conditionné. Rendu même quand aucune ligne n'attend de relevé — c'est aussi
 * l'endroit où l'on lit les dates de mise en vente déjà acquises.
 */
export function ConditioningPanel({ batchId }: { batchId: string }) {
  const packaging = useBatchPackaging(batchId);
  const lines = packaging.data ?? [];

  if (packaging.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mise en condition</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Chargement des contenants conditionnés…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (packaging.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mise en condition</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive-foreground">
            Impossible de charger les contenants conditionnés.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (lines.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Mise en condition</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Chaque contenant devient vendable au terme de sa mise en condition. Les dates affichées
          sont des <strong className="font-medium">estimations</strong> issues des délais de
          l&apos;instance : un indicateur d&apos;aide à la décision, pas une attestation.
        </p>

        <ul className="flex flex-col gap-4">
          {lines.map((line) => (
            <li key={line.id}>
              <ConditioningLine batchId={batchId} line={line} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Une ligne conditionnée : ce qu'elle est, où elle en est, et quoi y faire. */
function ConditioningLine({ batchId, line }: { batchId: string; line: PackagingLine }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="font-medium">
          {numFmt.format(line.containerVolumeL)} L × {line.quantity}
        </span>
        <Badge tone={line.conditioningMethod === "NONE" ? "muted" : "accent"}>
          {CONDITIONING_LABELS[line.conditioningMethod]}
        </Badge>
      </div>

      {line.availableForSaleDate !== null ? (
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>
            Mise en vente estimée au{" "}
            <strong className="font-medium">{formatDate(line.availableForSaleDate)}</strong>
          </span>
        </p>
      ) : (
        // Le motif vient du serveur et s'affiche **tel quel** : c'est lui qui
        // dit ce qui manque, et le reformuler ici ferait diverger deux textes
        // pour un même état.
        <p className="text-sm text-muted-foreground">
          {line.pendingReason ?? "Aucune date de mise en vente estimée."}
        </p>
      )}

      {line.conditioningMethod === "FORCED_CARBONATION" ? (
        <CarbonationReadingForm batchId={batchId} line={line} />
      ) : null}
    </div>
  );
}

/**
 * Aide au réglage puis relevé de pression, pour une ligne en carbonatation
 * forcée. Le formulaire n'est offert que là : une bouteille se carbonate par
 * refermentation, il n'y a pas de détendeur à relever — et l'API refuserait le
 * relevé (409 `NOT_FORCED_CARBONATION`).
 */
function CarbonationReadingForm({ batchId, line }: { batchId: string; line: PackagingLine }) {
  const fieldId = useId();
  const target = useCarbonationTarget(batchId);
  const reading = useRecordCarbonationReading(batchId);

  const [tempC, setTempC] = useState("");
  const [pressureBar, setPressureBar] = useState("");
  const [altitudeFt, setAltitudeFt] = useState("");
  /** Dernier verdict rendu ici — l'affichage détaillé de l'écart, avant recharge. */
  const [verdict, setVerdict] = useState<CarbonationReadingResult | null>(null);

  const temp = finite(tempC);
  const pressure = nonNegative(pressureBar);
  const altitude = finite(altitudeFt);
  const co2 = line.co2TargetVolumes;

  // Sans CO₂ visé, il n'y a pas de cible à calculer ni de mesure à juger : le
  // serveur jugerait contre 0 volume et déclarerait n'importe quel fût à la
  // cible. On le dit plutôt que d'offrir une saisie trompeuse.
  if (co2 === null || co2 <= 0) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Aucun CO₂ visé n&apos;a été saisi pour ce contenant : la pression cible ne peut pas être
          calculée, et un relevé ne serait pas interprétable.
        </span>
      </p>
    );
  }

  /**
   * Toute retouche de la température (ou de l'altitude) **périme** la cible
   * affichée : elle a été calculée pour l'ancienne valeur, et la garder à
   * l'écran ferait régler le détendeur sur une pression qui ne correspond plus
   * à la bière — l'erreur exacte que l'aide au réglage doit éviter.
   */
  const invalidateTarget = () => {
    if (target.data !== undefined || target.isError) target.reset();
  };

  const submitReading = () => {
    if (temp === null || pressure === null) return;
    reading.mutate(
      {
        lineId: line.id,
        input: {
          pressureBar: pressure,
          tempC: temp,
          ...(altitude !== null ? { altitudeFt: altitude } : {}),
        },
      },
      { onSuccess: setVerdict },
    );
  };

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">CO₂ visé</span>
        <span className="font-medium">{numFmt.format(co2)} volumes</span>
      </div>

      {/* Relevé déjà enregistré : réaffiché à l'ouverture de l'écran, sans quoi
          un opérateur qui revient au fût ne saurait pas ce qui a été mesuré. */}
      {line.measuredPressureBar !== null && verdict === null ? (
        <p className="text-sm text-muted-foreground">
          Dernier relevé : {barFmt.format(line.measuredPressureBar)} bar
          {line.measuredTempC !== null ? ` à ${numFmt.format(line.measuredTempC)} °C` : ""}.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-temp`}>Température de la bière (°C)</Label>
          <Input
            id={`${fieldId}-temp`}
            type="number"
            inputMode="decimal"
            step="0.1"
            value={tempC}
            onChange={(e) => {
              setTempC(e.target.value);
              invalidateTarget();
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-altitude`}>Altitude du site (ft, facultatif)</Label>
          <Input
            id={`${fieldId}-altitude`}
            type="number"
            inputMode="decimal"
            step="10"
            value={altitudeFt}
            onChange={(e) => {
              setAltitudeFt(e.target.value);
              invalidateTarget();
            }}
          />
        </div>
      </div>

      {/* Aide au réglage : ce qu'on lit AVANT de toucher au détendeur. */}
      <div className="flex flex-col gap-2">
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={temp === null || target.isPending}
            onClick={() =>
              target.mutate({
                co2TargetVolumes: co2,
                tempC: temp as number,
                ...(altitude !== null ? { altitudeFt: altitude } : {}),
              })
            }
          >
            {target.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Gauge className="size-5" aria-hidden="true" />
            )}
            Pression à régler
          </Button>
        </div>

        {target.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Calcul de la pression cible impossible. Vérifie la connexion et réessaie.
          </p>
        ) : null}
        {target.data !== undefined ? <TargetHint target={target.data} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-pressure`}>Pression relevée (bar)</Label>
        <Input
          id={`${fieldId}-pressure`}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={pressureBar}
          onChange={(e) => setPressureBar(e.target.value)}
        />
      </div>

      {reading.isError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Enregistrement du relevé impossible. Vérifie la connexion et réessaie.
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          disabled={temp === null || pressure === null || reading.isPending}
          onClick={submitReading}
        >
          {reading.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Gauge className="size-5" aria-hidden="true" />
          )}
          Enregistrer le relevé
        </Button>
      </div>

      {verdict !== null ? <Verdict verdict={verdict} /> : null}
    </div>
  );
}

/** Pression à viser et fourchette admise, à la température saisie. */
function TargetHint({ target }: { target: CarbonationTarget }) {
  const low = Math.max(0, target.targetBar - target.toleranceBar);
  const high = target.targetBar + target.toleranceBar;
  return (
    <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      Régler le détendeur sur{" "}
      <strong className="font-medium">{barFmt.format(target.targetBar)} bar</strong> — fourchette
      admise {barFmt.format(low)} à {barFmt.format(high)} bar à cette température.
    </p>
  );
}

/**
 * Verdict d'un relevé. ADR-11 : on dit que la mesure **atteint la cible** (ou de
 * combien elle s'en écarte), jamais qu'elle est « conforme ».
 */
function Verdict({ verdict }: { verdict: CarbonationReadingResult }) {
  const gap = Math.abs(verdict.deltaBar);
  const direction = verdict.deltaBar < 0 ? "en deçà de" : "au-dessus de";

  if (verdict.onTarget) {
    // La **date** n'est volontairement pas répétée ici : elle s'affiche sur la
    // ligne, qui est sa seule source. La redire dans le verdict créerait deux
    // affichages du même fait, qui divergeraient dès que les délais changent.
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Le relevé atteint la cible de {barFmt.format(verdict.targetBar)} bar à cette température.
          La date de mise en vente est estimée ci-dessus.
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
    >
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Le relevé est {barFmt.format(gap)} bar {direction} la cible de{" "}
          {barFmt.format(verdict.targetBar)} bar à cette température. Réajuste le détendeur, puis
          relève à nouveau.
        </span>
      </span>
      {verdict.pendingReason !== null ? <span>{verdict.pendingReason}</span> : null}
    </div>
  );
}
