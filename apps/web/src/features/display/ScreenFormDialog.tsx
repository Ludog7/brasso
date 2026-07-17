/**
 * Création / édition d'un écran (M7-12) : nom, `TemplatePicker` (liste/tableau/
 * cartes), **mentions légales** (texte libre — messages alcool/allergènes, ADR-01
 * aucune formulation en dur) et activation. Création réservée `admin` (RBAC amont).
 */

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { DisplayScreen, DisplayTemplate, ScreenInput } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";

import { useCreateScreen, useUpdateScreen } from "./hooks";
import { TemplatePicker } from "./TemplatePicker";

export function ScreenFormDialog({
  surfaceId,
  screen,
  onClose,
}: {
  surfaceId: string;
  screen?: DisplayScreen;
  onClose: () => void;
}) {
  const editing = screen !== undefined;
  const create = useCreateScreen(surfaceId);
  const update = useUpdateScreen(screen?.id ?? "");
  const mutation = editing ? update : create;

  const [name, setName] = useState(screen?.name ?? "");
  const [template, setTemplate] = useState<DisplayTemplate>(screen?.template ?? "CARDS");
  const [legalMentions, setLegalMentions] = useState(screen?.legalMentions ?? "");
  const [isActive, setIsActive] = useState(screen?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (name.trim() === "") {
      setError("Le nom de l'écran est obligatoire.");
      return;
    }
    setError(null);
    const input: ScreenInput = {
      name: name.trim(),
      template,
      isActive,
      // Mentions légales : texte libre non vide, sinon omis (l'API refuse la chaîne vide).
      ...(legalMentions.trim() ? { legalMentions: legalMentions.trim() } : {}),
    };
    mutation.mutate(input, { onSuccess: onClose });
  };

  return (
    <DialogShell
      title={editing ? "Modifier l'écran" : "Nouvel écran"}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="screen-name">Nom de l'écran</Label>
          <Input id="screen-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <TemplatePicker value={template} onChange={setTemplate} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="screen-mentions">Mentions légales</Label>
          <Textarea
            id="screen-mentions"
            value={legalMentions}
            onChange={(e) => setLegalMentions(e.target.value)}
            placeholder="L'abus d'alcool est dangereux pour la santé. À consommer avec modération."
          />
          <p className="text-xs text-muted-foreground">
            Texte affiché en permanence sur l'écran (alcool, allergènes…).
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Écran actif
        </label>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Enregistrement impossible. Réessayez.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            {editing ? "Enregistrer" : "Créer l'écran"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
