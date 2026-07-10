import { Loader2 } from "lucide-react";

import { useChangeBatchStatus } from "@/features/batches/hooks";
import type { BatchDetail, BatchStatus } from "@/lib/api";
import { Button } from "@/ui/button";

import { STATUS_LABELS } from "./labels";
import { allowedTransitions } from "./planning";

/**
 * Actions de progression de statut d'un batch (M3-09) : seules les transitions
 * autorisées (M3-06) sont proposées, avec confirmation. `ANNULE` libère les
 * réservations (côté serveur). La state machine Jour J (M4) est hors périmètre.
 */
export function StatusActions({ batch }: { batch: BatchDetail }) {
  const change = useChangeBatchStatus(batch.id);
  const targets = allowedTransitions(batch.status);

  const onClick = (target: BatchStatus): void => {
    if (change.isPending) return;
    const message =
      target === "ANNULE"
        ? "Annuler ce batch ? Les réservations de stock seront libérées."
        : `Faire passer le batch au statut « ${STATUS_LABELS[target]} » ?`;
    if (!window.confirm(message)) return;
    change.mutate(target);
  };

  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Statut terminal : aucune transition possible.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {targets.map((target) => (
          <Button
            key={target}
            type="button"
            variant={target === "ANNULE" ? "outline" : "default"}
            onClick={() => onClick(target)}
            disabled={change.isPending}
          >
            {change.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            {target === "ANNULE" ? "Annuler le batch" : `Passer à « ${STATUS_LABELS[target]} »`}
          </Button>
        ))}
      </div>
      {change.isError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Transition impossible. Réessaie dans un instant.
        </p>
      ) : null}
    </div>
  );
}
