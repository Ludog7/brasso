import { computeAltFermented } from "@brasso/core";
import { Loader2, Save } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { RecipeDetail, RecipeUpdateInput } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { EditorHeader } from "../EditorHeader";
import { useSaveRecipeDraft } from "../hooks";
import { useBeforeUnload } from "../useBeforeUnload";
import { AltDetailsForm } from "./AltDetailsForm";
import { AltIngredientsEditor } from "./AltIngredientsEditor";
import { AltStepsEditor } from "./AltStepsEditor";
import { IndicatorPanel } from "./IndicatorPanel";
import {
  altDetailsPatch,
  type AltEstimationInputs,
  type AltFormState,
  altStateFromRecipe,
  emptyEstimation,
  gravitiesEntered,
  parseNumber,
  toAltRecipe,
  toIngredientInputs,
  toStepInputs,
} from "./mapToEngine";

/** Signature persistée (ignore les clés de ligne) pour la détection du dirty. */
function draftSignature(state: AltFormState): string {
  return JSON.stringify({
    name: state.name.trim(),
    description: state.description.trim(),
    baseType: state.baseType,
    targetPh: state.targetPh.trim(),
    stabilizationMethod: state.stabilizationMethod,
    residualSugarRisk: state.residualSugarRisk,
    batchVolumeL: state.batchVolumeL.trim(),
    ingredients: toIngredientInputs(state),
    steps: toStepInputs(state),
  });
}

interface AltEditorProps {
  recipe: RecipeDetail;
}

/**
 * Éditeur complet de l'ALT_FERMENTED_ENGINE (M2-07, ADR-11), branché dans le shell
 * M2-05. Détails + ingrédients + process à gauche ; panneau d'indicateurs
 * `computeAltFermented` (pH, risque de carbonatation, ABV estimé) à droite. IBU/EBC
 * ne sont **pas** calculés ni affichés.
 *
 * Deux états distincts : le formulaire persisté (`state`, pilote dirty/sauvegarde)
 * et les hypothèses d'estimation (`estimation`, transientes — non persistées, cf.
 * `mapToEngine`). Seul le premier compte pour le `dirty`.
 */
export function AltEditor({ recipe }: AltEditorProps) {
  const navigate = useNavigate();
  const save = useSaveRecipeDraft(recipe.id);

  const [state, setState] = useState<AltFormState>(() => altStateFromRecipe(recipe));
  const [estimation, setEstimation] = useState<AltEstimationInputs>(emptyEstimation);
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
    setState(altStateFromRecipe(recipe));
    setLocalError(null);
  }, [recipe]);

  const baseline = useMemo(() => draftSignature(altStateFromRecipe(recipe)), [recipe]);
  const dirty = !readOnly && draftSignature(state) !== baseline;

  useBeforeUnload(dirty);

  // Indicateurs temps réel (debounce léger via `useDeferredValue`).
  const deferredState = useDeferredValue(state);
  const deferredEstimation = useDeferredValue(estimation);
  const result = useMemo(
    () => computeAltFermented(toAltRecipe(deferredState, deferredEstimation)),
    [deferredState, deferredEstimation],
  );
  const hasGravities = gravitiesEntered(deferredEstimation);

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
    const volume = parseNumber(state.batchVolumeL);
    if (volume !== undefined && volume <= 0) {
      setLocalError("Le volume cible doit être strictement positif.");
      return;
    }
    setLocalError(null);
    const update: RecipeUpdateInput = {
      name: state.name.trim(),
      notes: state.description.trim() === "" ? null : state.description.trim(),
      altDetails: altDetailsPatch(state),
    };
    save.mutate({
      update,
      ingredients: toIngredientInputs(state),
      steps: toStepInputs(state),
    });
  };

  const patchFields = (patch: Partial<AltFormState>) => setState((s) => ({ ...s, ...patch }));

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
            Cette recette n'est plus un brouillon : elle est en lecture seule. La création d'une
            nouvelle version arrivera avec le parcours versions (M2-09).
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-6">
            <AltDetailsForm
              fields={{
                name: state.name,
                description: state.description,
                baseType: state.baseType,
                targetPh: state.targetPh,
                stabilizationMethod: state.stabilizationMethod,
                residualSugarRisk: state.residualSugarRisk,
                batchVolumeL: state.batchVolumeL,
              }}
              disabled={readOnly}
              onChange={patchFields}
            />

            <AltIngredientsEditor
              state={state}
              disabled={readOnly}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            />

            <AltStepsEditor
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
                  Le blocage effectif est appliqué au serveur (parcours publication, M2-09).
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
            <IndicatorPanel
              result={result}
              hasGravities={hasGravities}
              estimation={estimation}
              disabled={readOnly}
              onEstimationChange={(patch) => setEstimation((e) => ({ ...e, ...patch }))}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
