/**
 * Confirmation d'**anonymisation** d'un membre (M6-10) — action **irréversible**
 * (droit à l'effacement §3.4). Confirmation forte : re-saisie du numéro d'adhérent.
 * Aucun wording trompeur : l'irréversibilité est explicite. Réservé au rôle `rgpd`.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { ApiError, type Member } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

import { useAnonymizeMember } from "./hooks";

export function AnonymizeConfirmDialog({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  const anonymize = useAnonymizeMember(member.id);
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim() === member.memberNumber && !anonymize.isPending;

  const alreadyDone =
    anonymize.error instanceof ApiError && anonymize.error.code === "MEMBER_ALREADY_ANONYMIZED";

  const submit = (): void => {
    if (confirmText.trim() !== member.memberNumber) return;
    anonymize.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <DialogShell
      title="Anonymiser le dossier"
      description="Cette action est irréversible."
      onClose={onClose}
      busy={anonymize.isPending}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          L'anonymisation efface <strong>définitivement</strong> les données personnelles de{" "}
          <strong>
            {member.firstName} {member.lastName}
          </strong>{" "}
          (n° {member.memberNumber}). Le numéro d'adhérent et les agrégats sont conservés, mais les
          informations personnelles ne pourront pas être récupérées.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="anon-confirm">
            Saisissez le numéro d'adhérent <strong>{member.memberNumber}</strong> pour confirmer
          </Label>
          <Input
            id="anon-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>

        {anonymize.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {alreadyDone
              ? "Ce membre a déjà été anonymisé."
              : "Anonymisation impossible. Réessayez."}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={anonymize.isPending}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {anonymize.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Anonymiser définitivement
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
