import { computeSoftDrink } from "@brasso/core";
import { Loader2, Save } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { RecipeDetail, RecipeUpdateInput } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { EditorHeader } from "../EditorHeader";
import { useSaveRecipeDraft } from "../hooks";
import { useBeforeUnload } from "../useBeforeUnload";
import { IndicatorPanel } from "./IndicatorPanel";
import {
  parseNumber,
  softDetailsPatch,
  type SoftFormState,
  softStateFromRecipe,
  toIngredientInputs,
  toSoftRecipe,
  toStepInputs,
} from "./mapToEngine";
import { SoftDetailsForm } from "./SoftDetailsForm";
import { SoftIngredientsEditor } from "./SoftIngredientsEditor";
import { SoftStepsEditor } from "./SoftStepsEditor";

/** Signature persistée (ignore les clés de ligne) pour la détection du dirty. */
function draftSignature(state: SoftFormState): string {
  return JSON.stringify({
    name: state.name.trim(),
    description: state.description.trim(),
    sugarConcentration: state.sugarConcentration.trim(),
    targetPh: state.targetPh.trim(),
    storageMode: state.storageMode,
    stabilizationMethod: state.stabilizationMethod,
    batchVolumeL: state.batchVolumeL.trim(),
    ingredients: toIngredientInputs(state),
    steps: toStepInputs(state),
  });
}

interface SoftEditorProps {
  recipe: RecipeDetail;
}

/**
 * Éditeur complet du SOFT_DRINK_ENGINE (M2-08, ADR-11), branché dans le shell M2-05.
 * Détails + ingrédients + process à gauche ; panneau d'indicateurs `computeSoftDrink`
 * (concentration en sucre, indicateur pH, rappel de stabilisation) à droite. Pas
 * d'ABV/IBU/EBC calculés ni affichés (aucune fermentation ni grist).
 *
 * Contrairement à l'ALT, tout ce qu'exige le panneau est **persisté** (colonnes de
 * `RecipeSoftDetails`) : un seul état, `state`, pilote calcul, dirty et sauvegarde.
 */
export function SoftEditor({ recipe }: SoftEditorProps) {
  const navigate = useNavigate();
  const save = useSaveRecipeDraft(recipe.id);

  const [state, setState] = useState<SoftFormState>(() => softStateFromRecipe(recipe));
  const [localError, setLocalError] = useState<string | null>(null);

  const readOnly = recipe.status !== "DRAFT";

  // Resynchronise le formulaire quand la recette change **après** le montage
  // (nouvelle version, ou état frais après sauvegarde) — jamais au montage, pour ne
  // pas régénérer les clés de lignes et remonter les champs pendant la saisie.
  const syncedRef = useRef(`${recipe.id}:${recipe.updatedAt}`);
  useEffect(() => {
    const sig = `${recipe.id}:${recipe.updatedAt}`;
    if (syncedRef.current === sig) return;
    syncedRef.current = sig;
    setState(softStateFromRecipe(recipe));
    setLocalError(null);
  }, [recipe]);

  const baseline = useMemo(() => draftSignature(softStateFromRecipe(recipe)), [recipe]);
  const dirty = !readOnly && draftSignature(state) !== baseline;

  useBeforeUnload(dirty);

  // Indicateurs temps réel (debounce léger via `useDeferredValue`).
  const deferredState = useDeferredValue(state);
  const result = useMemo(() => computeSoftDrink(toSoftRecipe(deferredState)), [deferredState]);

  const leave = () => {
    if (
      dirty &&
      !window.confirm("Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?")
    ) {
      return;
    }
    navigate("/recipes");
  };

  const onSave = () => {
    if (readOnly || save.isPending) return;
    if (state.name.trim().length === 0) {
      setLocalError("Le nom est requis.");
      return;
    }
    const ph = parseNumber(state.targetPh);
    if (ph !== undefined && (ph < 0 || ph > 14)) {
      setLocalError("Le pH doit être compris entre 0 et 14.");
      return;
    }
    const sugar = parseNumber(state.sugarConcentration);
    if (sugar !== undefined && sugar < 0) {
      setLocalError("La concentration en sucre ne peut pas être négative.");
      return;
    }
    const volume = parseNumber(state.batchVolumeL);
    if (volume !== undefined && volume <= 0) {
      setLocalError("Le volume cible doit être strictement positif.");
      return;
    }
    setLocalError(null);
    const update: RecipeUpdateInput = {
      name: state.name.trim(),
      notes: state.description.trim() === "" ? null : state.description.trim(),
      softDetails: softDetailsPatch(state),
    };
    save.mutate({
      update,
      ingredients: toIngredientInputs(state),
      steps: toStepInputs(state),
    });
  };

  const patchFields = (patch: Partial<SoftFormState>) => setState((s) => ({ ...s, ...patch }));

  return (
    <div className="min-h-screen bg-background">
      <EditorHeader
        name={recipe.name}
        engine={recipe.engine}
        status={recipe.status}
        version={recipe.version}
        onBack={leave}
        right={
          dirty ? (
            <Badge tone="muted" className="whitespace-nowrap">
              Modifications non enregistrées
            </Badge>
          ) : null
        }
      />

      <main className="mx-auto max-w-6xl p-6">
        {readOnly ? (
          <p
            role="status"
            className="mb-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            Cette recette n'est plus un brouillon : elle est en lecture seule. Gérez les versions et
            la publication depuis la page de la recette.
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <SoftDetailsForm
              fields={{
                name: state.name,
                description: state.description,
                sugarConcentration: state.sugarConcentration,
                targetPh: state.targetPh,
                storageMode: state.storageMode,
                stabilizationMethod: state.stabilizationMethod,
                batchVolumeL: state.batchVolumeL,
              }}
              disabled={readOnly}
              onChange={patchFields}
            />

            <SoftIngredientsEditor
              state={state}
              disabled={readOnly}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            />

            <SoftStepsEditor
              steps={state.steps}
              disabled={readOnly}
              onChange={(steps) => setState((s) => ({ ...s, steps }))}
            />

            {!readOnly && !result.publication.publishable ? (
              <div
                role="status"
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                <p className="font-medium">Publication impossible en l'état :</p>
                <ul className="mt-1 list-inside list-disc">
                  {result.publication.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-amber-200/80">
                  Complète ces points, puis publie depuis la page de la recette (contrôle appliqué
                  au serveur).
                </p>
              </div>
            ) : null}

            {localError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
              >
                {localError}
              </p>
            ) : save.isError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
              >
                Enregistrement impossible. Vérifie les champs puis réessaie.
              </p>
            ) : null}

            {!readOnly ? (
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  size="lg"
                  onClick={onSave}
                  disabled={!dirty || save.isPending}
                >
                  {save.isPending ? (
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
                {save.isSuccess && !dirty ? (
                  <span role="status" className="text-sm text-muted-foreground">
                    Modifications enregistrées.
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside>
            <IndicatorPanel result={result} />
          </aside>
        </div>
      </main>
    </div>
  );
}
