/**
 * Échéancier et **alertes de houblonnage** de l'étape courante (M9-11, §E).
 *
 * Trois besoins d'atelier, trois rendus distincts :
 * - **anticiper** — la liste des ajouts à venir avec leur échéance, pour peser
 *   pendant que le moût chauffe ;
 * - **prévenir** — un préavis à l'approche ({@link HOP_ALERT_LEAD_MS}) ;
 * - **alerter** — à l'échéance, un bandeau visuel **et** un signal sonore
 *   (mains occupées, tablette à distance), **acquittable** d'un seul geste.
 *
 * Tout est calculé en local depuis le plan et l'horloge du poste : aucune
 * requête sur le chemin d'une alerte, donc **rien ne s'arrête hors ligne** (§F).
 */

import type { DayState, StepSpec } from "@brasso/core";
import { Bell, Check, Flame, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { playChime } from "@/features/day/chime";
import { formatMinSec } from "@/features/day/format";
import { useNow } from "@/features/day/hooks";
import {
  buildHopSchedule,
  hopScheduleAnchor,
  hopScheduleSignature,
  type ScheduledHopAddition,
} from "@/features/day/hops";
import { HOP_NATURE_ACTIONS, HOP_NATURE_LABELS } from "@/features/day/labels";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

/** Quantité d'un ajout, en grammes (unité interne, CLAUDE.md). */
function formatAmount(amountG: number): string {
  return `${Math.round(amountG * 10) / 10} g`;
}

/**
 * Échéance d'un ajout, telle qu'elle se lit à l'écran. Sans ancrage (étape pas
 * démarrée), on annonce la **position** dans l'étape plutôt qu'une fausse heure.
 */
function formatDeadline(item: ScheduledHopAddition): string {
  if (item.remainingMs === null) {
    return item.addition.offsetFromStartMin === 0
      ? "au démarrage de l'étape"
      : `à +${item.addition.offsetFromStartMin} min du démarrage`;
  }
  if (item.remainingMs <= 0) return `il y a ${formatMinSec(-item.remainingMs / 60_000)}`;
  return `dans ${formatMinSec(item.remainingMs / 60_000)}`;
}

/**
 * Déclenche le signal sonore aux **changements** de statut, une seule fois par
 * ajout et par palier. La dépendance est la signature de l'échéancier, pas le
 * tableau : sans quoi l'effet tournerait à chaque battement d'horloge.
 */
function useHopChimes(schedule: readonly ScheduledHopAddition[]): void {
  const signalled = useRef(new Map<string, "soon" | "due">());
  // L'échéancier est un tableau neuf à chaque rendu ; l'effet se déclenche donc
  // sur sa **signature**, et lit la dernière version par une ref.
  const latest = useRef(schedule);
  latest.current = schedule;
  const signature = hopScheduleSignature(schedule);

  useEffect(() => {
    for (const item of latest.current) {
      const already = signalled.current.get(item.key);
      if (item.status === "due" && already !== "due") {
        signalled.current.set(item.key, "due");
        playChime("due");
      } else if (item.status === "soon" && already === undefined) {
        signalled.current.set(item.key, "soon");
        playChime("approach");
      }
    }
  }, [signature]);
}

export function HopSchedule({ step, state }: { step: StepSpec; state: DayState }) {
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(() => new Set());
  const additions = step.hopAdditions ?? [];
  const anchored = hopScheduleAnchor(state, step) !== null;
  // L'horloge ne bat que si des échéances sont réellement ancrées dans le temps.
  const now = useNow(additions.length > 0 && anchored);
  const schedule = buildHopSchedule(step, state, now, acknowledged);
  useHopChimes(schedule);

  if (additions.length === 0) return null;

  const due = schedule.filter((item) => item.status === "due");
  const soon = schedule.filter((item) => item.status === "soon");
  const acknowledge = (key: string) => setAcknowledged((current) => new Set(current).add(key));

  return (
    <section aria-label="Ajouts de houblon" className="flex w-full max-w-xs flex-col gap-3">
      {due.map((item) => (
        <div
          key={item.key}
          role="alert"
          className="flex flex-col gap-3 rounded-lg border-2 border-destructive bg-destructive/15 p-4 text-left"
        >
          <div className="flex items-center gap-2">
            {item.addition.nature === "FLAME_OUT" ? (
              <Flame className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <Bell className="size-5 shrink-0" aria-hidden="true" />
            )}
            <span className="text-base font-semibold">
              {HOP_NATURE_LABELS[item.addition.nature]} — maintenant
            </span>
          </div>
          <p className="text-lg font-semibold">
            {item.addition.name} · {formatAmount(item.addition.amountG)}
          </p>
          <p className="text-sm">{HOP_NATURE_ACTIONS[item.addition.nature]}</p>
          <Button size="lg" className="w-full" onClick={() => acknowledge(item.key)}>
            <Check className="size-5" aria-hidden="true" />
            Ajout fait
          </Button>
        </div>
      ))}

      {soon.map((item) => (
        <p
          key={item.key}
          role="status"
          className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-left text-sm"
        >
          Prépare la pesée : {item.addition.name} · {formatAmount(item.addition.amountG)} —{" "}
          {formatDeadline(item)}.
        </p>
      ))}

      <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Houblonnage
      </h3>
      <ul className="flex flex-col gap-2 text-left">
        {schedule.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={item.status === "done" ? "text-muted-foreground line-through" : ""}>
              {item.addition.name} · {formatAmount(item.addition.amountG)}
            </span>
            <Badge tone={item.addition.nature === "FLAME_OUT" ? "warning" : "neutral"}>
              {HOP_NATURE_LABELS[item.addition.nature]}
            </Badge>
            {item.status === "done" ? (
              <Badge tone="success">Fait</Badge>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Timer className="size-3.5" aria-hidden="true" />
                {formatDeadline(item)}
              </span>
            )}
            {item.addition.inconsistent ? (
              <span role="note" className="text-amber-300">
                échéance au-delà de la durée d'ébullition déclarée
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
