import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { AltEditor } from "@/features/recipes/alt/AltEditor";
import { BeerEditor } from "@/features/recipes/beer/BeerEditor";
import { GenericEngineEditor } from "@/features/recipes/GenericEngineEditor";
import { useRecipe } from "@/features/recipes/hooks";
import { Button } from "@/ui/button";

/**
 * Shell éditeur `/recipes/:id/edit` : charge la recette puis délègue le contenu
 * au moteur — BEER (M2-06) et ALT_FERMENTED (M2-07) ont leur éditeur dédié ;
 * SOFT_DRINK utilise le shell commun M2-05 en attendant son éditeur (M2-08).
 */
export function RecipeEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const recipe = useRecipe(id);

  if (recipe.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span>Chargement de la recette…</span>
      </div>
    );
  }

  if (recipe.isError || !recipe.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p role="alert" className="text-destructive-foreground">
          Recette introuvable ou injoignable.
        </p>
        <Button variant="outline" onClick={() => navigate("/recipes")}>
          Retour aux recettes
        </Button>
      </div>
    );
  }

  if (recipe.data.engine === "BEER") {
    return <BeerEditor recipe={recipe.data} />;
  }
  if (recipe.data.engine === "ALT_FERMENTED") {
    return <AltEditor recipe={recipe.data} />;
  }
  return <GenericEngineEditor recipe={recipe.data} />;
}
