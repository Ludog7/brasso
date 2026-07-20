/**
 * Mode manuel « **Forcer l'étape** » (M4-12, spec « Mode manuel ») : avance malgré
 * des conditions incomplètes (panne tablette, sonde HS, oubli de validation) en
 * **traçant** un écart de procédure. Action à conséquence → **confirmation explicite**
 * dans une modale exigeant un **motif non vide** ; l'auteur est l'utilisateur courant.
 *
 * Wording **neutre** (ADR-08, traçabilité) : l'écart est une **trace**, pas une faute.
 * En succès, l'événement `FORCE_STEP` avance l'étape et écrit un `DeviationLog`
 * (M4-05) ; un refus (409) reste géré par le toast du dérouleur (`useDayEvent`).
 */

import type { StepSpec } from "@brasso/core";
import { AlertTriangle, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { useDayEvent } from "@/features/day/hooks";
import { PHASE_LABELS } from "@/features/day/labels";
import { useSession } from "@/stores/session";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";

export function ForceStepDialog({
  step,
  batchId,
  onClose,
}: {
  step: StepSpec;
  batchId: string;
  onClose: () => void;
}) {
  const event = useDayEvent(batchId);
  const author = useSession((s) => s.user?.displayName ?? "Opérateur");
  const [reason, setReason] = useState("");
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ouverture : focus le motif (saisie immédiate au clavier / tablette).
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canSubmit = reason.trim() !== "" && !event.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    event.mutate({ type: "FORCE_STEP", author, reason: reason.trim() }, { onSuccess: onClose });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !event.isPending) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !event.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-border bg-background p-6 text-left shadow-xl"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="size-6 text-warning" aria-hidden="true" />
          <h2 id={titleId} className="text-xl font-semibold">
            Forcer l'étape
          </h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Passe à l'étape suivante ({PHASE_LABELS[step.phase]}
          {step.label ? ` — ${step.label}` : ""}) malgré des conditions incomplètes. Le forçage est
          <strong className="font-medium text-foreground"> tracé au journal d'écart</strong>{" "}
          (auteur, motif, date) : c'est une trace, pas une faute.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="force-reason">Motif du forçage (obligatoire)</Label>
            <Textarea
              id="force-reason"
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. sonde de température HS, palier validé au thermomètre manuel."
              aria-describedby={`${titleId}-hint`}
            />
            <p id={`${titleId}-hint`} className="text-xs text-muted-foreground">
              Signé : {author}.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={event.isPending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {event.isPending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-5" aria-hidden="true" />
              )}
              Confirmer le forçage
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
