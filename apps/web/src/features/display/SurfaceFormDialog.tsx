/**
 * Création / édition d'une surface d'affichage (M7-12) : nom **libre** (Bar/Salle/
 * Événement — ADR-01) + description optionnelle + activation. Le conflit d'unicité du
 * nom (**409**) est traduit en message clair. Création réservée `admin` (RBAC en amont).
 */

import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { ApiError, type DisplaySurface, type SurfaceInput } from "@/lib/api";
import { Button } from "@/ui/button";
import { DialogShell } from "@/ui/dialog-shell";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";

import { useCreateSurface, useUpdateSurface } from "./hooks";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "DISPLAY_SURFACE_CONFLICT") {
    return "Une surface porte déjà ce nom.";
  }
  return "Enregistrement impossible. Réessayez.";
}

export function SurfaceFormDialog({
  surface,
  onClose,
}: {
  surface?: DisplaySurface;
  onClose: () => void;
}) {
  const editing = surface !== undefined;
  const create = useCreateSurface();
  const update = useUpdateSurface(surface?.id ?? "");
  const mutation = editing ? update : create;

  const [name, setName] = useState(surface?.name ?? "");
  const [description, setDescription] = useState(surface?.description ?? "");
  const [isActive, setIsActive] = useState(surface?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (name.trim() === "") {
      setError("Le nom de la surface est obligatoire.");
      return;
    }
    setError(null);
    const input: SurfaceInput = {
      name: name.trim(),
      isActive,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    mutation.mutate(input, { onSuccess: onClose });
  };

  return (
    <DialogShell
      title={editing ? "Modifier la surface" : "Nouvelle surface"}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="surface-name">Nom</Label>
          <Input id="surface-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="surface-description">Description</Label>
          <Input
            id="surface-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Surface active
        </label>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {errorMessage(mutation.error)}
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
            {editing ? "Enregistrer" : "Créer la surface"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
