import { Loader2, Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { RecipeDetail, RecipeEngine, RecipeUpdateInput } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";

import { EditorHeader } from "./EditorHeader";
import { useUpdateRecipe } from "./hooks";
import { ENGINE_LABELS } from "./labels";
import { useBeforeUnload } from "./useBeforeUnload";

/** Volume cible = `batchVolumeL` du détail moteur (une seule table 1-1). */
function currentVolume(recipe: RecipeDetail): number | null {
  switch (recipe.engine) {
    case "BEER":
      return recipe.beerDetails?.batchVolumeL ?? null;
    case "ALT_FERMENTED":
      return recipe.altDetails?.batchVolumeL ?? null;
    case "SOFT_DRINK":
      return recipe.softDetails?.batchVolumeL ?? null;
  }
}

/** Route le patch de volume vers la bonne table de détail selon le moteur. */
function volumePatch(engine: RecipeEngine, batchVolumeL: number): RecipeUpdateInput {
  switch (engine) {
    case "BEER":
      return { beerDetails: { batchVolumeL } };
    case "ALT_FERMENTED":
      return { altDetails: { batchVolumeL } };
    case "SOFT_DRINK":
      return { softDetails: { batchVolumeL } };
  }
}

const numberToField = (value: number | null): string => (value == null ? "" : String(value));

/**
 * Shell d'édition commun (M2-05) : nom, description, volume cible + sauvegarde PATCH.
 * BEER/ALT_FERMENTED/SOFT_DRINK ont tous leur éditeur dédié (M2-06/07/08) ; ce shell
 * reste le **repli** pour tout futur moteur introduit sans éditeur spécifique.
 */
export function GenericEngineEditor({ recipe: data }: { recipe: RecipeDetail }) {
  const navigate = useNavigate();
  const update = useUpdateRecipe(data.id);

  const [name, setName] = useState(data.name);
  const [notes, setNotes] = useState(data.notes ?? "");
  const [volume, setVolume] = useState(numberToField(currentVolume(data)));
  const [localError, setLocalError] = useState<string | null>(null);

  const readOnly = data.status !== "DRAFT";

  useEffect(() => {
    setName(data.name);
    setNotes(data.notes ?? "");
    setVolume(numberToField(currentVolume(data)));
    setLocalError(null);
    // Resynchronise uniquement sur un changement d'identité/version de la recette.
  }, [data.id, data.updatedAt]);

  const dirty =
    !readOnly &&
    (name !== data.name ||
      notes !== (data.notes ?? "") ||
      volume !== numberToField(currentVolume(data)));

  useBeforeUnload(dirty);

  const leave = () => {
    if (
      dirty &&
      !window.confirm("Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?")
    ) {
      return;
    }
    navigate("/recipes");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly || update.isPending) {
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setLocalError("Le nom est requis.");
      return;
    }
    const patch: RecipeUpdateInput = {
      name: trimmedName,
      notes: notes.trim().length === 0 ? null : notes.trim(),
    };
    const rawVolume = volume.trim();
    if (rawVolume.length > 0) {
      const parsed = Number(rawVolume);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setLocalError("Le volume cible doit être un nombre strictement positif.");
        return;
      }
      Object.assign(patch, volumePatch(data.engine, parsed));
    }
    setLocalError(null);
    update.mutate(patch);
  };

  return (
    <div className="min-h-screen bg-background">
      <EditorHeader
        name={data.name}
        engine={data.engine}
        status={data.status}
        version={data.version}
        onBack={leave}
        right={
          dirty ? (
            <Badge tone="muted" className="whitespace-nowrap">
              Modifications non enregistrées
            </Badge>
          ) : null
        }
      />

      <main className="mx-auto max-w-2xl p-6">
        {readOnly ? (
          <p
            role="status"
            className="mb-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            Cette recette n'est plus un brouillon : elle est en lecture seule. La création d'une
            nouvelle version arrivera avec le parcours versions (M2-09).
          </p>
        ) : null}

        <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Nom</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={readOnly}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={readOnly}
                  placeholder="Notes de recette, intentions, remarques…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="volume">Volume cible (L)</Label>
                <Input
                  id="volume"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  disabled={readOnly}
                  className="max-w-40"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Le formulaire spécifique au moteur {ENGINE_LABELS[data.engine]} (ingrédients, calculs)
              arrivera dans un prochain ticket.
            </CardContent>
          </Card>

          {localError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
            >
              {localError}
            </p>
          ) : update.isError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
            >
              Enregistrement impossible. Vérifie ta connexion puis réessaie.
            </p>
          ) : null}

          {!readOnly ? (
            <div className="flex items-center gap-4">
              <Button type="submit" size="lg" disabled={!dirty || update.isPending}>
                {update.isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                    Enregistrement…
                  </>
                ) : (
                  <>
                    <Save className="size-5" aria-hidden="true" />
                    Enregistrer
                  </>
                )}
              </Button>
              {update.isSuccess && !dirty ? (
                <span role="status" className="text-sm text-muted-foreground">
                  Modifications enregistrées.
                </span>
              ) : null}
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
