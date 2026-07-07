import { ArrowLeft, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useCreateRecipe } from "@/features/recipes/hooks";
import {
  createInputForDrinkType,
  DRINK_TYPES,
  type DrinkType,
  ENGINE_LABELS,
  engineForDrinkType,
} from "@/features/recipes/labels";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

export function NewRecipePage() {
  const navigate = useNavigate();
  const create = useCreateRecipe();
  const [drinkType, setDrinkType] = useState<DrinkType>("BIERE");
  const [name, setName] = useState("");

  const trimmedName = name.trim();
  const engine = engineForDrinkType(drinkType);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedName || create.isPending) {
      return;
    }
    create.mutate(createInputForDrinkType(drinkType, trimmedName), {
      onSuccess: (recipe) => navigate(`/recipes/${recipe.id}/edit`, { replace: true }),
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/recipes" aria-label="Retour aux recettes">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
        </Button>
        <span className="text-lg font-semibold">Nouvelle recette</span>
      </header>

      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>Créer une recette</CardTitle>
            <CardDescription>
              Le type de boisson détermine le moteur de calcul de la recette.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="drink-type">Type de boisson</Label>
                <Select
                  id="drink-type"
                  value={drinkType}
                  onChange={(e) => setDrinkType(e.target.value as DrinkType)}
                  disabled={create.isPending}
                >
                  {DRINK_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <p className="text-sm text-muted-foreground">
                  Moteur :{" "}
                  <span className="font-medium text-foreground">{ENGINE_LABELS[engine]}</span>
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="recipe-name">Nom de la recette</Label>
                <Input
                  id="recipe-name"
                  name="name"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={create.isPending}
                />
              </div>

              {create.isError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground"
                >
                  Création impossible. Vérifie ta connexion puis réessaie.
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                disabled={create.isPending || trimmedName.length === 0}
              >
                {create.isPending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                    Création…
                  </>
                ) : (
                  "Créer et ouvrir l'éditeur"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
