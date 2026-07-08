import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { RecipeLifecycleActions } from "@/features/recipes/detail/RecipeLifecycleActions";
import { RecipeReadOnlyView } from "@/features/recipes/detail/RecipeReadOnlyView";
import { VersionSelector } from "@/features/recipes/detail/VersionSelector";
import { EditorHeader } from "@/features/recipes/EditorHeader";
import { useRecipe } from "@/features/recipes/hooks";
import { Button } from "@/ui/button";

/**
 * Page détail `/recipes/:id` (M2-09) — pivot du cycle de vie d'une recette : lecture
 * complète (détails, ingrédients, process, prévisions locales), navigation entre
 * versions de la famille et actions de publication (ADR-07). L'édition d'un brouillon
 * reste déléguée à l'éditeur (`/recipes/:id/edit`).
 */
export function RecipeDetailPage() {
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

  const data = recipe.data;

  return (
    <div className="min-h-screen bg-background">
      <EditorHeader
        name={data.name}
        engine={data.engine}
        status={data.status}
        version={data.version}
        onBack={() => navigate("/recipes")}
        right={<VersionSelector familyId={data.familyId} currentId={data.id} />}
      />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <RecipeLifecycleActions recipe={data} />
        </section>

        <RecipeReadOnlyView recipe={data} />
      </main>
    </div>
  );
}
