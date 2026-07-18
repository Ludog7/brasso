/**
 * Primitives d'UI partagées par les calculateurs d'atelier (M8-02) : champ numérique
 * contrôlé, ligne de résultat, coquille de section. Aucune arithmétique d'unité ici —
 * les entrées sont déjà dans les unités de `@brasso/core` (L, kg, °C, SG brute) et
 * tout le calcul reste dans le cœur ({{M8-01}}). Cibles tactiles ≥ 48 px (§6).
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

/** Parse une saisie utilisateur en nombre ; accepte la virgule décimale. Vide/NaN → `undefined`. */
export function parseNum(raw: string): number | undefined {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Formats d'affichage (sans conversion : les valeurs sortent déjà en unités cible). */
export const fmt0 = (n: number): string => Math.round(n).toString();
export const fmt1 = (n: number): string => n.toFixed(1);
export const fmt3 = (n: number): string => n.toFixed(3);

/** Champ numérique contrôlé, libellé associé et unité affichée. */
export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  step,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {unit ? <span className="ml-1 font-normal text-muted-foreground">({unit})</span> : null}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Une ligne de résultat : libellé à gauche, valeur (chiffres alignés) à droite. */
export function ResultRow({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn("text-right tabular-nums", strong ? "text-lg font-semibold" : "font-medium")}
      >
        {value}
        {hint ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </div>
  );
}

/** Coquille d'un calculateur : titre, description, colonne de saisie + colonne de résultat. */
export function CalcSection({
  title,
  description,
  inputs,
  result,
}: {
  title: string;
  description: string;
  inputs: ReactNode;
  result: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">{inputs}</div>
        <div className="flex flex-col gap-3">{result}</div>
      </div>
    </section>
  );
}

/** Message d'erreur de saisie, listant les champs à vérifier. Ne masque pas le formulaire. */
export function InvalidHint({ fields }: { fields: string[] }) {
  return (
    <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
      {fields.length > 0
        ? `À vérifier : ${fields.join(", ")}.`
        : "Complétez les champs pour obtenir un résultat."}
    </p>
  );
}
