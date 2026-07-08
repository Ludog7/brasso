import { computeAltFermented, computeBeer, computeSoftDrink } from "@brasso/core";
import { useMemo } from "react";

import { useBjcpStyles } from "@/features/recipes/hooks";
import type { RecipeDetail } from "@/lib/api";

import { IndicatorPanel as AltIndicatorPanel } from "../alt/IndicatorPanel";
import {
  altStateFromRecipe,
  emptyEstimation,
  gravitiesEntered,
  toAltRecipe,
} from "../alt/mapToEngine";
import { beerStateFromRecipe, isComputable, toBeerRecipe } from "../beer/mapToEngine";
import { PredictionPanel } from "../beer/PredictionPanel";
import { IndicatorPanel as SoftIndicatorPanel } from "../soft/IndicatorPanel";
import { softStateFromRecipe, toSoftRecipe } from "../soft/mapToEngine";

/**
 * Prévisions calculées **localement** pour la vue lecture seule (M2-09) — réutilise
 * le panneau du moteur et les projections `mapToEngine`, sans rien recalculer à la
 * main (règle FORMULES-BRASSICOLES.md). Tout est dérivé des intrants persistés.
 *
 * ALT : les hypothèses d'estimation (densités, conservation) ne sont pas persistées
 * (cf. pattern §5) → panneau en lecture seule sur les valeurs par défaut ; l'ABV
 * reste masqué faute de densités, l'indicateur pH provient du pH persisté.
 */
export function RecipePredictions({ recipe }: { recipe: RecipeDetail }) {
  if (recipe.engine === "BEER") {
    return <BeerPredictions recipe={recipe} />;
  }
  if (recipe.engine === "ALT_FERMENTED") {
    return <AltPredictions recipe={recipe} />;
  }
  if (recipe.engine === "SOFT_DRINK") {
    return <SoftPredictions recipe={recipe} />;
  }
  return null;
}

function BeerPredictions({ recipe }: { recipe: RecipeDetail }) {
  const stylesQuery = useBjcpStyles();
  const styles = stylesQuery.data ?? [];
  const state = useMemo(() => beerStateFromRecipe(recipe), [recipe]);
  const style = styles.find((s) => s.code === state.styleCode);
  const result = useMemo(
    () => (isComputable(state) ? computeBeer(toBeerRecipe(state, style)) : null),
    [state, style],
  );
  return <PredictionPanel result={result} style={style} />;
}

function AltPredictions({ recipe }: { recipe: RecipeDetail }) {
  const state = useMemo(() => altStateFromRecipe(recipe), [recipe]);
  const estimation = useMemo(() => emptyEstimation(), []);
  const result = useMemo(
    () => computeAltFermented(toAltRecipe(state, estimation)),
    [state, estimation],
  );
  return (
    <AltIndicatorPanel
      result={result}
      hasGravities={gravitiesEntered(estimation)}
      estimation={estimation}
      disabled
      onEstimationChange={() => {}}
    />
  );
}

function SoftPredictions({ recipe }: { recipe: RecipeDetail }) {
  const state = useMemo(() => softStateFromRecipe(recipe), [recipe]);
  const result = useMemo(() => computeSoftDrink(toSoftRecipe(state)), [state]);
  return <SoftIndicatorPanel result={result} />;
}
