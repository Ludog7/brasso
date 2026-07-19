/**
 * Saisie des **durées prévisionnelles du cycle** à la validation de
 * l'ensemencement (M9-12, brief §3.A.3). C'est le moment charnière : le brassin
 * quitte le Jour J pour une phase longue qui, sans cette saisie, ne serait ni
 * datée ni suivie.
 *
 * Trois partis pris tenus par cet écran :
 *
 * - **Franchissable en une action.** Les champs arrivent pré-remplis des
 *   `Settings` et le bouton principal suffit : l'atelier est en train de ranger,
 *   personne ne doit rester bloqué sur un formulaire. Aucune valeur par défaut
 *   n'est écrite ici (ADR-01) — sans défauts lus du serveur, l'écran le dit et
 *   propose de clore le Jour J sans planifier, la saisie restant possible depuis
 *   la fiche du brassin.
 * - **Aucun calcul de date côté front.** L'aperçu appelle `buildBatchMilestones`
 *   de `@brasso/core` (FORMULES §13.1) avec le **fuseau de l'instance** — pas
 *   celui du navigateur, qu'une tablette mal réglée décalerait. La présence d'un
 *   dry hop vient de `core` elle aussi, lue du `recipeSnapshot` figé (M9-16).
 * - **Une durée à 0 supprime le jalon.** C'est la règle de FORMULES §13.1 ; elle
 *   est annoncée dans l'UI, faute de quoi la disparition du jalon se lirait comme
 *   un bug.
 */

import {
  buildBatchMilestones,
  MAX_CYCLE_DURATION_DAYS,
  MIN_CYCLE_DURATION_DAYS,
} from "@brasso/core";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";

import { MILESTONE_LABELS } from "@/features/batches/labels";
import { usePlanCycle } from "@/features/day/hooks";
import type { BatchCycleDefaults, BatchMilestoneKind, CyclePlanInput } from "@/lib/api";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

/** Une durée du formulaire : la clé d'API, son libellé et son aide. */
interface DurationField {
  key: "fermentationDays" | "dryHopDays" | "coldCrashDays" | "gardeDays";
  kind: BatchMilestoneKind;
  hint: string;
}

const FIELDS: readonly DurationField[] = [
  { key: "fermentationDays", kind: "FERMENTATION", hint: "Fermentation principale." },
  { key: "dryHopDays", kind: "DRY_HOP", hint: "Houblonnage à cru prévu par la recette." },
  { key: "coldCrashDays", kind: "COLD_CRASH", hint: "Descente en froid avant garde." },
  { key: "gardeDays", kind: "GARDE", hint: "Garde / maturation avant conditionnement." },
];

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** `YYYY-MM-DD` (déjà dans le fuseau de l'instance) → date lisible. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDate;
  return dateFmt.format(new Date(year, month - 1, day));
}

/**
 * Durée saisie → valeur exploitable. `null` = saisie invalide (vide, non
 * entière, hors bornes) : refusée avec un message, jamais écrêtée en silence
 * (FORMULES §13.1).
 */
function parseDuration(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) return null;
  if (value < MIN_CYCLE_DURATION_DAYS || value > MAX_CYCLE_DURATION_DAYS) return null;
  return value;
}

const BOUNDS_MESSAGE = `Durée attendue : un nombre entier de jours entre ${MIN_CYCLE_DURATION_DAYS} et ${MAX_CYCLE_DURATION_DAYS}.`;

/**
 * Champs pré-remplis des défauts serveur. Sans défauts, le formulaire n'est pas
 * rendu du tout : on ne fabrique pas de durées côté front (ADR-01).
 */
function initialValues(defaults: BatchCycleDefaults | null): Record<string, string> {
  if (!defaults) return {};
  return {
    fermentationDays: String(defaults.fermentationDays),
    dryHopDays: String(defaults.dryHopDays),
    coldCrashDays: String(defaults.coldCrashDays),
    gardeDays: String(defaults.gardeDays),
  };
}

/** Durée saisie pour une phase ; `0` si le champ n'est pas affiché (dry hop absent). */
function durationOf(
  parsed: readonly { field: DurationField; value: number | null }[],
  key: DurationField["key"],
): number {
  return parsed.find((p) => p.field.key === key)?.value ?? 0;
}

export function CyclePlanDialog({
  batchId,
  defaults,
  onPlanned,
  onSkip,
  onClose,
}: {
  batchId: string;
  /** Défauts lus du serveur (M9-16), ou `null` s'ils n'ont pas pu être chargés. */
  defaults: BatchCycleDefaults | null;
  /** Cycle planifié (ou mis en file) → l'appelant clôt l'étape d'ensemencement. */
  onPlanned: () => void;
  /** Clôt l'étape **sans** planifier — issue de secours, jamais le chemin nominal. */
  onSkip: () => void;
  onClose: () => void;
}) {
  const plan = usePlanCycle(batchId);
  const titleId = useId();
  const fieldId = useId();

  /**
   * Instant d'ensemencement **figé à l'ouverture** : l'aperçu et la valeur
   * envoyée désignent ainsi le même instant. Le laisser courir ferait glisser
   * les dates affichées pendant que l'opérateur saisit.
   */
  const [pitchedAt] = useState(() => Date.now());

  const [values, setValues] = useState<Record<string, string>>(() => initialValues(defaults));

  // Le champ dry hop n'existe que si la **recette** en porte un (§C) : la
  // décision vient de `core`, jamais d'une analyse refaite ici.
  const fields = FIELDS.filter((f) => f.key !== "dryHopDays" || defaults?.hasDryHop === true);

  const parsed = fields.map((field) => ({ field, value: parseDuration(values[field.key] ?? "") }));
  const invalid = parsed.filter((p) => p.value === null).map((p) => p.field.key);
  const allValid = invalid.length === 0;

  /**
   * Aperçu daté, recalculé **à chaque frappe** — c'est le retour qui donne
   * confiance dans la saisie (§D). Entièrement délégué à `core` : ce composant
   * n'ajoute pas un jour à une date, il affiche ce que la formule renvoie.
   *
   * Calculé au rendu, sans mémoïsation : `buildBatchMilestones` est pure et
   * parcourt quatre phases — la mémoïser coûterait plus que la recalculer.
   */
  const preview =
    defaults && allValid
      ? buildBatchMilestones({
          pitchedAt,
          timezone: defaults.timezone,
          durations: {
            fermentationDays: durationOf(parsed, "fermentationDays"),
            dryHopDays: durationOf(parsed, "dryHopDays"),
            coldCrashDays: durationOf(parsed, "coldCrashDays"),
            gardeDays: durationOf(parsed, "gardeDays"),
          },
          hasDryHop: defaults.hasDryHop,
        })
      : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!defaults || !allValid || plan.isPending) return;
    const input: CyclePlanInput = { pitchedAt: new Date(pitchedAt).toISOString() };
    for (const { field, value } of parsed) input[field.key] = value ?? 0;
    plan.mutate(input, { onSuccess: onPlanned });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !plan.isPending) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !plan.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-lg flex-col gap-5 rounded-lg border border-border bg-background p-6 text-left shadow-xl"
      >
        <div className="flex items-center gap-3">
          <CalendarClock className="size-6 text-primary" aria-hidden="true" />
          <h2 id={titleId} className="text-xl font-semibold">
            Planifier le cycle
          </h2>
        </div>

        {defaults === null ? (
          <NoDefaults onSkip={onSkip} onClose={onClose} />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Le brassin est ensemencé : ces durées datent la suite du cycle. Elles sont
              pré-remplies par les réglages de l&apos;instance et restent ajustables depuis la fiche
              du brassin.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const raw = values[field.key] ?? "";
                const value = parseDuration(raw);
                const id = `${fieldId}-${field.key}`;
                return (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={id}>{MILESTONE_LABELS[field.kind]} (jours)</Label>
                    <Input
                      id={id}
                      // `inputMode` numérique : pavé chiffres au doigt, sans
                      // passer par le clavier alphabétique de la tablette.
                      type="number"
                      inputMode="numeric"
                      min={MIN_CYCLE_DURATION_DAYS}
                      max={MAX_CYCLE_DURATION_DAYS}
                      step={1}
                      value={raw}
                      aria-invalid={value === null}
                      aria-describedby={`${id}-hint`}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    />
                    <p
                      id={`${id}-hint`}
                      className={
                        value === null
                          ? "text-xs text-destructive-foreground"
                          : "text-xs text-muted-foreground"
                      }
                      {...(value === null ? { role: "alert" as const } : {})}
                    >
                      {value === null
                        ? BOUNDS_MESSAGE
                        : value === 0
                          ? "Durée 0 : ce jalon ne sera pas créé."
                          : field.hint}
                    </p>
                  </div>
                );
              })}
            </div>

            <CyclePreview preview={preview} />

            {plan.isError ? (
              <p role="alert" className="text-sm text-destructive-foreground">
                Planification impossible. Vérifie la connexion et réessaie.
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={plan.isPending}>
                Revenir à l&apos;étape
              </Button>
              <Button type="submit" size="lg" disabled={!allValid || plan.isPending}>
                {plan.isPending ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                )}
                Valider et planifier
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Aperçu daté de la séquence + date de fin prévue du brassin (§D). */
function CyclePreview({ preview }: { preview: ReturnType<typeof buildBatchMilestones> | null }) {
  if (preview === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Corrige les durées pour voir les dates prévues.
      </p>
    );
  }
  if (preview.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Toutes les durées sont à 0 : aucun jalon ne sera créé.
      </p>
    );
  }

  const end = preview[preview.length - 1];
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">Jalons prévus</h3>
      <ol className="mt-2 grid gap-1.5 text-sm">
        {preview.map((milestone) => (
          <li key={milestone.kind} className="flex flex-wrap justify-between gap-x-4">
            <span className="text-muted-foreground">
              {MILESTONE_LABELS[milestone.kind]} · {milestone.plannedDurationDays} j
            </span>
            <span>
              {formatDate(milestone.plannedStartDate)} → {formatDate(milestone.plannedEndDate)}
            </span>
          </li>
        ))}
      </ol>
      {end ? (
        <p className="mt-3 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Fin prévue du brassin : </span>
          <span className="font-medium">{formatDate(end.plannedEndDate)}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Défauts indisponibles (hors ligne dès l'ouverture, API en erreur). On
 * n'invente pas de durées côté front (ADR-01) : on laisse clore le Jour J et on
 * renvoie la planification à la fiche du brassin, plutôt que de retenir un
 * opérateur devant un formulaire qu'on ne sait pas remplir.
 */
function NoDefaults({ onSkip, onClose }: { onSkip: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-sm text-muted-foreground">
        Les durées par défaut n&apos;ont pas pu être lues. Tu peux clore l&apos;ensemencement
        maintenant et planifier le cycle depuis la fiche du brassin dès le retour du réseau.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Revenir à l&apos;étape
        </Button>
        <Button type="button" size="lg" onClick={onSkip}>
          Clore sans planifier
        </Button>
      </div>
    </div>
  );
}
