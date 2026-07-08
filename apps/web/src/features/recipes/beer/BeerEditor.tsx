import type { BeerResult } from "@brasso/core";
import { computeBeer } from "@brasso/core";
import { Loader2, Save } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { BeerDetails, RecipeDetail, RecipeUpdateInput } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";

import { EditorHeader } from "../EditorHeader";
import { useBjcpStyles, useSaveRecipeDraft } from "../hooks";
import { useBeforeUnload } from "../useBeforeUnload";
import { BeerDetailsForm } from "./BeerDetailsForm";
import { IngredientsEditor } from "./IngredientsEditor";
import {
  type BeerFormState,
  beerStateFromRecipe,
  isComputable,
  parseNumber,
  toBeerRecipe,
  toIngredientInputs,
  toStepInputs,
} from "./mapToEngine";
import { PredictionPanel } from "./PredictionPanel";
import { StepsEditor } from "./StepsEditor";

/** Signature persistée (ignore les clés de ligne) pour la détection du dirty. */
function draftSignature(state: BeerFormState): string {
  return JSON.stringify({
    name: state.name.trim(),
    description: state.description.trim(),
    styleCode: state.styleCode,
    batchVolumeL: state.batchVolumeL.trim(),
    boilTimeMin: state.boilTimeMin.trim(),
    efficiencyPct: state.efficiencyPct.trim(),
    ingredients: toIngredientInputs(state),
    steps: toStepInputs(state),
  });
}

function beerDetailsPatch(state: BeerFormState): Partial<BeerDetails> {
  const patch: Partial<BeerDetails> = { styleBjcp: state.styleCode };
  const volume = parseNumber(state.batchVolumeL);
  if (volume !== undefined && volume > 0) patch.batchVolumeL = volume;
  const boil = parseNumber(state.boilTimeMin);
  if (boil !== undefined) patch.boilTimeMin = Math.round(boil);
  const efficiency = parseNumber(state.efficiencyPct);
  if (efficiency !== undefined) patch.efficiency = efficiency / 100;
  return patch;
}

interface BeerEditorProps {
  recipe: RecipeDetail;
}

/**
 * Éditeur complet du BEER_ENGINE (M2-06), branché dans le shell M2-05. Détails +
 * ingrédients + process à gauche, panneau de prévision `computeBeer` (recalculé à
 * chaque frappe, `useDeferredValue`) + jauges BJCP à droite. Une seule sauvegarde
 * persiste tous les intrants (PATCH détails + PUT ingrédients + PUT étapes).
 */
export function BeerEditor({ recipe }: BeerEditorProps) {
  const navigate = useNavigate();
  const stylesQuery = useBjcpStyles();
  const save = useSaveRecipeDraft(recipe.id);

  const [state, setState] = useState<BeerFormState>(() => beerStateFromRecipe(recipe));
  const [localError, setLocalError] = useState<string | null>(null);

  const readOnly = recipe.status !== "DRAFT";

  // Resynchronise le formulaire quand la recette change **après** le montage
  // (nouvelle version, ou état frais après sauvegarde) — jamais au montage, pour
  // ne pas régénérer les clés de lignes et remonter les champs pendant la saisie.
  const syncedRef = useRef(`${recipe.id}:${recipe.updatedAt}`);
  useEffect(() => {
    const sig = `${recipe.id}:${recipe.updatedAt}`;
    if (syncedRef.current === sig) return;
    syncedRef.current = sig;
    setState(beerStateFromRecipe(recipe));
    setLocalError(null);
  }, [recipe]);

  const baseline = useMemo(() => draftSignature(beerStateFromRecipe(recipe)), [recipe]);
  const dirty = !readOnly && draftSignature(state) !== baseline;

  useBeforeUnload(dirty);

  // Prévision temps réel (debounce léger via `useDeferredValue`).
  const deferred = useDeferredValue(state);
  const styles = stylesQuery.data ?? [];
  const result = useMemo<BeerResult | null>(() => {
    if (!isComputable(deferred)) return null;
    const style = styles.find((s) => s.code === deferred.styleCode);
    return computeBeer(toBeerRecipe(deferred, style));
  }, [deferred, styles]);
  const selectedStyle = styles.find((s) => s.code === state.styleCode);

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
    const volume = parseNumber(state.batchVolumeL);
    if (volume !== undefined && volume <= 0) {
      setLocalError("Le volume cible doit être strictement positif.");
      return;
    }
    const efficiency = parseNumber(state.efficiencyPct);
    if (efficiency !== undefined && (efficiency < 0 || efficiency > 100)) {
      setLocalError("L'efficacité doit être comprise entre 0 et 100 %.");
      return;
    }
    setLocalError(null);
    const update: RecipeUpdateInput = {
      name: state.name.trim(),
      notes: state.description.trim() === "" ? null : state.description.trim(),
      beerDetails: beerDetailsPatch(state),
    };
    save.mutate({
      update,
      ingredients: toIngredientInputs(state),
      steps: toStepInputs(state),
    });
  };

  const patchFields = (patch: Partial<BeerFormState>) => setState((s) => ({ ...s, ...patch }));

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
            <BeerDetailsForm
              fields={{
                name: state.name,
                description: state.description,
                styleCode: state.styleCode,
                batchVolumeL: state.batchVolumeL,
                boilTimeMin: state.boilTimeMin,
                efficiencyPct: state.efficiencyPct,
              }}
              styles={styles}
              stylesLoading={stylesQuery.isPending}
              disabled={readOnly}
              onChange={patchFields}
            />

            <IngredientsEditor
              state={state}
              disabled={readOnly}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            />

            <StepsEditor
              steps={state.steps}
              disabled={readOnly}
              onChange={(steps) => setState((s) => ({ ...s, steps }))}
            />

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
            <PredictionPanel result={result} style={selectedStyle} />
          </aside>
        </div>
      </main>
    </div>
  );
}
