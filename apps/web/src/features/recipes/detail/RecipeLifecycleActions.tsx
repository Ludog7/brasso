import { Archive, GitBranch, Loader2, Pencil, Send } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useArchiveRecipe, useNewVersionRecipe, usePublishRecipe } from "@/features/recipes/hooks";
import { ApiError, publicationErrors, type RecipeDetail } from "@/lib/api";
import { Button } from "@/ui/button";

/** Message d'erreur générique d'une transition refusée hors 422 (ex. 409 conflit). */
function transitionMessage(error: unknown): string {
  return error instanceof ApiError && error.message
    ? error.message
    : "Action impossible. Réessaie dans un instant.";
}

/**
 * Barre d'actions du cycle de vie d'une recette (M2-09, ADR-07). L'affichage dépend
 * strictement du statut :
 * - **DRAFT** : « Modifier » (éditeur) + « Publier ». Un refus 422 restitue la liste
 *   des manquements (`recipePublicationCheck`, déjà rédigés ADR-11) à corriger.
 * - **PUBLISHED** : « Nouvelle version » (crée un brouillon n+1 et ouvre son éditeur ;
 *   la version publiée reste inchangée) + « Archiver ».
 * - **ARCHIVED** : aucune mutation (lecture seule stricte).
 */
export function RecipeLifecycleActions({ recipe }: { recipe: RecipeDetail }) {
  const navigate = useNavigate();
  const publish = usePublishRecipe(recipe.id);
  const newVersion = useNewVersionRecipe(recipe.id);
  const archive = useArchiveRecipe(recipe.id);

  if (recipe.status === "ARCHIVED") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Recette archivée — lecture seule.
      </p>
    );
  }

  if (recipe.status === "PUBLISHED") {
    const onNewVersion = () => {
      if (newVersion.isPending) return;
      if (!window.confirm("Créer une nouvelle version (brouillon n+1) de cette recette ?")) return;
      newVersion.mutate(undefined, {
        onSuccess: (draft) => navigate(`/recipes/${draft.id}/edit`),
      });
    };
    const onArchive = () => {
      if (archive.isPending) return;
      if (!window.confirm("Archiver cette recette publiée ?")) return;
      archive.mutate();
    };
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Button type="button" size="lg" onClick={onNewVersion} disabled={newVersion.isPending}>
            {newVersion.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch className="size-5" aria-hidden="true" />
            )}
            Nouvelle version
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={onArchive}
            disabled={archive.isPending}
          >
            {archive.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Archive className="size-5" aria-hidden="true" />
            )}
            Archiver
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          La version publiée v{recipe.version} reste inchangée : « Nouvelle version » ouvre un
          brouillon n+1 à éditer.
        </p>
        {newVersion.isError || archive.isError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
          >
            {transitionMessage(newVersion.error ?? archive.error)}
          </p>
        ) : null}
      </div>
    );
  }

  // DRAFT
  const missing = publicationErrors(publish.error);
  const onPublish = () => {
    if (publish.isPending) return;
    publish.mutate();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg" variant="outline">
          <Link to={`/recipes/${recipe.id}/edit`}>
            <Pencil className="size-5" aria-hidden="true" />
            Modifier
          </Link>
        </Button>
        <Button type="button" size="lg" onClick={onPublish} disabled={publish.isPending}>
          {publish.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-5" aria-hidden="true" />
          )}
          Publier
        </Button>
      </div>

      {missing !== null ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <p className="font-medium">Publication impossible en l'état — à compléter :</p>
          <ul className="list-disc pl-5">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="text-xs text-warning/80">
            Corrige ces points dans l'éditeur (« Modifier »), puis publie à nouveau.
          </p>
        </div>
      ) : publish.isError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
        >
          {transitionMessage(publish.error)}
        </p>
      ) : null}
    </div>
  );
}
