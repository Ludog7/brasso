/**
 * Journal des **écarts de procédure** du batch (M4-12) — **lecture seule**. Liste
 * les forçages tracés (`DeviationLog`, écrits par M4-05) du plus ancien au plus
 * récent : phase, étape, motif, auteur, date. Wording **neutre** (ADR-08) : une
 * trace de décision opérateur, jamais un blâme. Rafraîchi après chaque forçage.
 */

import { ClipboardList } from "lucide-react";

import { formatDateTime } from "@/features/day/format";
import { useDeviations } from "@/features/day/hooks";
import { DAY_PHASE_LABELS } from "@/features/day/labels";

export function DeviationJournal({ batchId }: { batchId: string }) {
  const { data, isPending, isError } = useDeviations(batchId);

  return (
    <section
      aria-label="Journal des écarts de procédure"
      className="flex w-full max-w-md flex-col gap-3 text-left"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <ClipboardList className="size-4" aria-hidden="true" />
        Journal des écarts
      </h3>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Chargement du journal…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Journal indisponible pour le moment.</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun écart pour l'instant : le déroulé suit le modèle.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {data.map((d) => (
            <li key={d.id} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium">{d.phase ? DAY_PHASE_LABELS[d.phase] : d.step}</span>
                <time className="text-xs text-muted-foreground">
                  {formatDateTime(d.occurredAt)}
                </time>
              </div>
              <p className="mt-1 text-sm">{d.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">Forcé par {d.author ?? "—"}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
