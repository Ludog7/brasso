import { Loader2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useImportRecipe } from "@/features/recipes/hooks";
import { detectImportFormat, importErrors } from "@/lib/api";
import { Button } from "@/ui/button";

/** Lit un fichier texte via `FileReader` (compatible jsdom + navigateurs anciens). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
    reader.readAsText(file);
  });
}

/**
 * Import d'une recette depuis un fichier (M2-12) : BeerXML (.xml) ou JSON
 * propriétaire `brasso-recipe` (.json). Le format est détecté d'après le contenu.
 * En succès → redirection vers l'éditeur du DRAFT créé ; un refus 422 restitue les
 * messages d'erreur (chemins des champs fautifs).
 */
export function ImportRecipeButton() {
  const navigate = useNavigate();
  const importRecipe = useImportRecipe();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [errors, setErrors] = useState<string[] | null>(null);

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Réinitialise pour pouvoir réimporter le même fichier (ex. après correction).
    event.target.value = "";
    if (!file) return;
    setErrors(null);
    const content = await readFileText(file);
    importRecipe.mutate(
      { content, format: detectImportFormat(content) },
      {
        onSuccess: (recipe) => navigate(`/recipes/${recipe.id}/edit`),
        onError: (error) =>
          setErrors(importErrors(error) ?? ["Import impossible. Vérifie le fichier fourni."]),
      },
    );
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => inputRef.current?.click()}
        disabled={importRecipe.isPending}
      >
        {importRecipe.isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-5" aria-hidden="true" />
        )}
        Importer
      </Button>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".xml,.json,application/xml,text/xml,application/json"
        aria-label="Importer une recette"
        className="sr-only"
        onChange={(event) => {
          void onFile(event);
        }}
      />
      {errors !== null ? (
        <div
          role="alert"
          className="flex max-w-md flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
        >
          <p className="font-medium">Import impossible :</p>
          <ul className="list-disc pl-5">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
