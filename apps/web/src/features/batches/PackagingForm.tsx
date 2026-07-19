/**
 * Écran de **conditionnement** d'un brassin (M9-13) : volume conditionné,
 * répartition en contenants, effet immédiat sur le stock de produits finis.
 *
 * C'est l'écran qui referme la boucle « recette → brassin → stock » : à la
 * validation, la bière devient un article vendable en caisse et affichable au
 * bar (M7, sans ligne nouvelle dans ce pipeline).
 *
 * Trois choix structurants :
 *
 * - **Le volume enregistré est celui des lignes, pas celui du champ.** Le champ
 *   « volume à répartir » sert à proposer une répartition et à mesurer l'écart ;
 *   le serveur, lui, déduit le volume conditionné de `Σ contenance × quantité`
 *   (M9-06). Deux chiffres « constatés » qui divergeraient obligeraient à
 *   arbitrer entre eux — l'écran montre donc les deux et nomme l'écart.
 * - **Les avertissements n'empêchent jamais d'enregistrer** (§A, §D) : un
 *   rendement > 100 % ou un stock de bouteilles insuffisant sont des signaux,
 *   pas des verrous. Le stock déclaratif est souvent en retard sur l'atelier, et
 *   bloquer un conditionnement en cours serait pire que le laisser passer.
 * - **La répartition proposée est une proposition.** `splitIntoContainers`
 *   (`core`, FORMULES §13.3) remplit les lignes ; les quantités envoyées restent
 *   celles que l'opérateur a sous les yeux.
 */

import { packagedVolumeFromLines, packagingYield, splitIntoContainers } from "@brasso/core";
import { AlertTriangle, CheckCircle2, Loader2, Package, Plus, Trash2, Wand2 } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import type {
  ConditioningMethod,
  PackagingLineInput,
  PackagingRecordResult,
  StockItem,
} from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { SearchableSelect } from "@/ui/searchable-select";
import { Select } from "@/ui/select";

import { useStockItems } from "../stock/hooks";
import { useBatchVolumes, useRecordPackaging } from "./hooks";

/** Libellés de mise en condition (M9-15) — la ligne, pas le brassin. */
const CONDITIONING_LABELS: Record<ConditioningMethod, string> = {
  NONE: "Aucune",
  REFERMENTATION: "Refermentation en bouteille",
  FORCED_CARBONATION: "Carbonatation forcée (fût)",
};

const CONDITIONING_METHODS: ConditioningMethod[] = ["NONE", "REFERMENTATION", "FORCED_CARBONATION"];

/** Ligne en cours de saisie : tout en chaîne, la validation vient après. */
interface DraftLine {
  key: string;
  containerItemId: string;
  containerVolumeL: string;
  quantity: string;
  conditioningMethod: ConditioningMethod;
  co2TargetVolumes: string;
}

let nextKey = 0;
const emptyLine = (): DraftLine => ({
  key: `line-${++nextKey}`,
  containerItemId: "",
  containerVolumeL: "",
  quantity: "",
  conditioningMethod: "NONE",
  co2TargetVolumes: "",
});

const numFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** Nombre fini strictement positif, sinon `null`. */
function positive(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Entier ≥ 0, sinon `null` — on ne conditionne pas 2,5 bouteilles. */
function count(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Ligne exploitable → payload d'API ; `null` si la saisie est incomplète. */
function toInput(line: DraftLine): PackagingLineInput | null {
  const containerVolumeL = positive(line.containerVolumeL);
  const quantity = count(line.quantity);
  if (containerVolumeL === null || quantity === null || quantity === 0) return null;
  return {
    containerVolumeL,
    quantity,
    ...(line.containerItemId !== "" ? { containerItemId: line.containerItemId } : {}),
    ...(line.conditioningMethod !== "NONE" ? { conditioningMethod: line.conditioningMethod } : {}),
    ...(line.conditioningMethod === "FORCED_CARBONATION" && positive(line.co2TargetVolumes) !== null
      ? { co2TargetVolumes: positive(line.co2TargetVolumes) as number }
      : {}),
  };
}

export function PackagingForm({
  batchId,
  batchNumber,
  onRecorded,
}: {
  batchId: string;
  batchNumber: number;
  /**
   * Conditionnement écrit. Le résultat remonte à la page plutôt que d'être
   * gardé ici : l'écriture fait passer le brassin en `TERMINE`, ce qui retire
   * le formulaire de l'écran. Un récapitulatif détenu par le formulaire
   * disparaîtrait donc au moment précis où il devient utile.
   */
  onRecorded: (result: PackagingRecordResult) => void;
}) {
  const volumes = useBatchVolumes(batchId);
  const containers = useStockItems("CONDITIONNEMENT");
  const record = useRecordPackaging(batchId);
  const volumeId = useId();

  const [targetVolume, setTargetVolume] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const [confirming, setConfirming] = useState(false);

  /**
   * Seuls les articles portant une **contenance** sont des contenants : une
   * capsule ou un muselet est un consommable de conditionnement, pas quelque
   * chose qu'on remplit. Les offrir au choix ajouterait du bruit précisément là
   * où le brief reproche la difficulté à retrouver un article (§3.J).
   */
  const catalog = (containers.data ?? []).filter((item) => containerVolumeOf(item) !== null);
  const inputs = lines.map(toInput).filter((l): l is PackagingLineInput => l !== null);

  // Volume **réellement** enregistré : celui des lignes (M9-06), calculé par
  // `core` avec la même fonction que le serveur.
  const packagedL = packagedVolumeFromLines(inputs) ?? 0;
  const target = positive(targetVolume);
  const preBoilL = volumes.data?.preBoil.volumeL ?? null;
  const pitchedL = volumes.data?.pitched.volumeL ?? null;
  const yieldResult = packagingYield(preBoilL ?? 0, packagedL);
  const remainderL = target === null ? null : Math.round((target - packagedL) * 1e6) / 1e6;

  const patch = (key: string, change: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));

  /**
   * Remplit les lignes depuis `splitIntoContainers` : grands contenants d'abord,
   * reste affiché (FORMULES §13.3). Écrase la saisie en cours — d'où le libellé
   * explicite « Proposer une répartition » plutôt qu'un calcul automatique qui
   * effacerait le travail de l'opérateur sans qu'il l'ait demandé.
   */
  const suggest = () => {
    if (target === null) return;
    const split = splitIntoContainers(
      target,
      catalog.map((item) => ({ id: item.id, volumeL: containerVolumeOf(item) as number })),
    );
    if (split.allocations.length === 0) return;
    setLines(
      split.allocations.map((allocation) => ({
        ...emptyLine(),
        containerItemId: allocation.id,
        containerVolumeL: String(allocation.volumeL),
        quantity: String(allocation.quantity),
      })),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Volume conditionné</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={volumeId}>Volume à répartir (L)</Label>
              <Input
                id={volumeId}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={targetVolume}
                aria-describedby={`${volumeId}-hint`}
                onChange={(e) => setTargetVolume(e.target.value)}
              />
              <p id={`${volumeId}-hint`} className="text-xs text-muted-foreground">
                Sert à proposer la répartition et à mesurer l&apos;écart. Le volume enregistré est
                celui des contenants saisis ci-dessous.
              </p>
            </div>

            <dl className="grid content-start gap-2 text-sm">
              <Figure
                label="Volume ensemencé"
                value={pitchedL === null ? "Non renseigné" : `${numFmt.format(pitchedL)} L`}
              />
              <Figure label="Volume réparti" value={`${numFmt.format(packagedL)} L`} />
              {remainderL !== null ? (
                <Figure
                  label={remainderL >= 0 ? "Reste non conditionné" : "Dépassement"}
                  value={`${numFmt.format(Math.abs(remainderL))} L`}
                />
              ) : null}
              <Figure
                label="Rendement de conditionnement"
                value={
                  yieldResult.percent === null
                    ? "Non calculable"
                    : `${numFmt.format(yieldResult.percent)} %`
                }
              />
            </dl>
          </div>

          {/* Rendement > 100 % : signalé, jamais bloquant ni effacé (§A). */}
          {yieldResult.warning !== undefined ? <Warning>{yieldResult.warning}</Warning> : null}
          {yieldResult.percent === null && packagedL > 0 ? (
            <p className="text-sm text-muted-foreground">
              Rendement non calculable : le volume pré-ébullition n&apos;a pas été relevé.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Répartition en contenants</CardTitle>
          <Button type="button" variant="outline" onClick={suggest} disabled={target === null}>
            <Wand2 className="size-5" aria-hidden="true" />
            Proposer une répartition
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            La répartition proposée est une <strong className="font-medium">suggestion</strong> :
            les quantités enregistrées sont celles affichées ici.
          </p>

          {containers.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Chargement des contenants…
            </p>
          ) : containers.isError ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              Impossible de charger les contenants. La saisie manuelle du volume par contenant reste
              possible.
            </p>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun contenant au catalogue (un contenant est un article de conditionnement portant
              une contenance). Saisis le volume à la main, ou ajoute des contenants depuis
              l&apos;écran Stock.
            </p>
          ) : null}

          {lines.map((line, index) => (
            <LineFields
              key={line.key}
              line={line}
              index={index}
              catalog={catalog}
              removable={lines.length > 1}
              onPatch={(change) => patch(line.key, change)}
              onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
            />
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="size-5" aria-hidden="true" />
              Ajouter un contenant
            </Button>
          </div>
        </CardContent>
      </Card>

      {record.isError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Enregistrement impossible. Vérifie la connexion et réessaie.
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          size="lg"
          disabled={inputs.length === 0 || record.isPending}
          onClick={() => setConfirming(true)}
        >
          <Package className="size-5" aria-hidden="true" />
          Enregistrer le conditionnement
        </Button>
      </div>

      {confirming ? (
        <ConfirmDialog
          lines={inputs}
          catalog={catalog}
          packagedL={packagedL}
          batchNumber={batchNumber}
          pending={record.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            record.mutate(
              { lines: inputs },
              {
                onSuccess: (data) => {
                  setConfirming(false);
                  onRecorded(data);
                },
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

/** Contenance (L) d'un article `CONDITIONNEMENT`, lue de ses attributs JSONB. */
function containerVolumeOf(item: StockItem): number | null {
  const attributes = item.attributes;
  if (typeof attributes !== "object" || attributes === null) return null;
  const value = (attributes as { volumeL?: unknown }).volumeL;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Une ligne de la répartition. */
function LineFields({
  line,
  index,
  catalog,
  removable,
  onPatch,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  catalog: readonly StockItem[];
  removable: boolean;
  onPatch: (change: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const fieldId = useId();
  const selected = catalog.find((item) => item.id === line.containerItemId);
  const quantity = count(line.quantity);

  // Stock insuffisant : **avertissement**, pas un blocage (§D). Le stock
  // déclaratif peut être en retard sur la réalité de l'atelier ; l'écart se
  // régularise par inventaire, il n'a pas à interrompre un conditionnement.
  const shortfall =
    selected !== undefined && quantity !== null && quantity > selected.available
      ? quantity - selected.available
      : null;

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm text-muted-foreground">Contenant {index + 1}</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableSelect
          label="Contenant"
          value={line.containerItemId}
          options={catalog.map((item) => ({
            value: item.id,
            label: item.name,
            hint: `${numFmt.format(item.available)} en stock`,
          }))}
          placeholder="Rechercher un contenant…"
          onChange={(value) => {
            const item = catalog.find((c) => c.id === value);
            const volumeL = item ? containerVolumeOf(item) : null;
            // La contenance du catalogue **pré-remplit** le volume rempli, qui
            // reste modifiable : un fût de 20 L peut n'en recevoir que 18.
            onPatch({
              containerItemId: value,
              ...(volumeL !== null ? { containerVolumeL: String(volumeL) } : {}),
            });
          }}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-volume`}>Volume rempli par contenant (L)</Label>
          <Input
            id={`${fieldId}-volume`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={line.containerVolumeL}
            onChange={(e) => onPatch({ containerVolumeL: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-quantity`}>Quantité</Label>
          <Input
            id={`${fieldId}-quantity`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={line.quantity}
            onChange={(e) => onPatch({ quantity: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-conditioning`}>Mise en condition</Label>
          <Select
            id={`${fieldId}-conditioning`}
            value={line.conditioningMethod}
            onChange={(e) => onPatch({ conditioningMethod: e.target.value as ConditioningMethod })}
          >
            {CONDITIONING_METHODS.map((method) => (
              <option key={method} value={method}>
                {CONDITIONING_LABELS[method]}
              </option>
            ))}
          </Select>
        </div>

        {line.conditioningMethod === "FORCED_CARBONATION" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-co2`}>CO₂ visé (volumes)</Label>
            <Input
              id={`${fieldId}-co2`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={line.co2TargetVolumes}
              onChange={(e) => onPatch({ co2TargetVolumes: e.target.value })}
            />
          </div>
        ) : null}
      </div>

      {shortfall !== null ? (
        <Warning>
          Stock de « {selected?.name} » insuffisant : il en manque {numFmt.format(shortfall)}. La
          saisie reste enregistrable, l&apos;écart se régularisera par inventaire.
        </Warning>
      ) : null}

      {removable ? (
        <div>
          <Button type="button" variant="outline" onClick={onRemove}>
            <Trash2 className="size-5" aria-hidden="true" />
            Retirer ce contenant
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * Récapitulatif **avant écriture** (§E). L'opération est irréversible au sens du
 * registre append-only : une erreur se corrige par un mouvement inverse, jamais
 * par une modification — d'où la confirmation explicite.
 */
function ConfirmDialog({
  lines,
  catalog,
  packagedL,
  batchNumber,
  pending,
  onCancel,
  onConfirm,
}: {
  lines: readonly PackagingLineInput[];
  catalog: readonly StockItem[];
  packagedL: number;
  batchNumber: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-lg flex-col gap-5 rounded-lg border border-border bg-background p-6 text-left shadow-xl"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          Confirmer le conditionnement
        </h2>

        <ul className="grid gap-1.5 text-sm">
          {lines.map((line, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-x-4">
              <span className="text-muted-foreground">
                {nameOf(catalog, line.containerItemId)} · {numFmt.format(line.containerVolumeL)} L
              </span>
              <span className="font-medium">× {line.quantity}</span>
            </li>
          ))}
        </ul>

        <p className="border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Volume conditionné enregistré : </span>
          <span className="font-medium">{numFmt.format(packagedL)} L</span>
        </p>

        <p className="text-sm text-muted-foreground">
          Le brassin n° {batchNumber} passera en <strong className="font-medium">Terminé</strong> et
          son stock de produits finis sera créé. Le registre est append-only : une erreur se corrige
          ensuite par un mouvement inverse, pas par une modification.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Revenir à la saisie
          </Button>
          <Button type="button" size="lg" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            )}
            Confirmer et enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Effet constaté après écriture (§E) : produit fini, quantités, statut.
 *
 * Rendue par la **page**, pas par le formulaire : le brassin est passé en
 * `TERMINE`, et le formulaire n'a plus lieu d'être à l'écran.
 */
export function PackagingSummary({
  result,
  batchId,
}: {
  result: PackagingRecordResult;
  batchId: string;
}) {
  // Le catalogue sert à nommer les contenants du récapitulatif ; il est déjà en
  // cache à ce stade (le formulaire vient de l'utiliser).
  const catalog = useStockItems("CONDITIONNEMENT").data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CheckCircle2 className="size-6 text-emerald-400" aria-hidden="true" />
          Conditionnement enregistré
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Le produit fini est en stock : {numFmt.format(result.packagedVolumeL)} L répartis en{" "}
          {result.lines.reduce((sum, l) => sum + l.quantity, 0)} contenants.
        </p>

        <ul className="grid gap-1.5 text-sm">
          {result.lines.map((line) => (
            <li key={line.id} className="flex flex-wrap justify-between gap-x-4">
              <span className="text-muted-foreground">
                {nameOf(catalog, line.containerItemId)} · {numFmt.format(line.containerVolumeL)} L
              </span>
              <span className="font-medium">× {line.quantity}</span>
            </li>
          ))}
        </ul>

        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Statut du brassin :</span>
          <Badge tone="success">
            {result.batchStatus === "TERMINE" ? "Terminé" : result.batchStatus}
          </Badge>
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/stock">Voir le stock de produits finis</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/batches/${batchId}`}>Retour au brassin</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Nom d'un contenant, ou une mention explicite s'il n'est pas suivi en stock. */
function nameOf(catalog: readonly StockItem[], id: string | null | undefined): string {
  if (id == null || id === "") return "Contenant non suivi";
  return catalog.find((item) => item.id === id)?.name ?? "Contenant";
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** Avertissement de saisie : visible, jamais bloquant. */
function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
