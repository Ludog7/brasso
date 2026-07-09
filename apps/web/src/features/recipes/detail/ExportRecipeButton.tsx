import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { type RecipeDetail, recipesApi } from "@/lib/api";
import { Button } from "@/ui/button";

/** Déclenche le téléchargement d'un fichier texte côté navigateur. */
function triggerDownload(filename: string, content: string, contentType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Bouton d'export d'une recette (M2-12), disponible quel que soit le statut. BEER →
 * fichier BeerXML ; ALT/SOFT → JSON propriétaire `brasso-recipe` v1. Le nom du
 * fichier est proposé par l'API (`Content-Disposition`).
 */
export function ExportRecipeButton({ recipe }: { recipe: RecipeDetail }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onExport = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const file = await recipesApi.exportRecipe(recipe.id);
      triggerDownload(file.filename, file.content, file.contentType);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        variant="outline"
        onClick={() => void onExport()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-5" aria-hidden="true" />
        )}
        Exporter
      </Button>
      {failed ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
        >
          Export impossible. Réessaie dans un instant.
        </p>
      ) : null}
    </div>
  );
}
