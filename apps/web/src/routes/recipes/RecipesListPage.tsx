import { Loader2, LogOut, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useRecipes } from "@/features/recipes/hooks";
import { ENGINE_LABELS, STATUS_LABELS, STATUS_TONE } from "@/features/recipes/labels";
import { useLogout } from "@/hooks/useAuth";
import type { RecipeEngine, RecipeStatus } from "@/lib/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Label } from "@/ui/label";
import { Select } from "@/ui/select";

const ENGINES: RecipeEngine[] = ["BEER", "ALT_FERMENTED", "SOFT_DRINK"];
const STATUSES: RecipeStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function RecipesListPage() {
  const logout = useLogout();
  const [engine, setEngine] = useState<RecipeEngine | "">("");
  const [status, setStatus] = useState<RecipeStatus | "">("");

  const filters = useMemo(
    () => ({ ...(engine ? { engine } : {}), ...(status ? { status } : {}) }),
    [engine, status],
  );
  const recipes = useRecipes(filters);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="text-lg font-semibold">
          Brasso
        </Link>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-5" aria-hidden="true" />
          )}
          Déconnexion
        </Button>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Recettes</h1>
          <Button asChild size="lg">
            <Link to="/recipes/new">
              <Plus className="size-5" aria-hidden="true" />
              Nouvelle recette
            </Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-engine">Moteur</Label>
            <Select
              id="filter-engine"
              value={engine}
              onChange={(e) => setEngine(e.target.value as RecipeEngine | "")}
              className="min-w-52"
            >
              <option value="">Tous les moteurs</option>
              {ENGINES.map((value) => (
                <option key={value} value={value}>
                  {ENGINE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-status">Statut</Label>
            <Select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as RecipeStatus | "")}
              className="min-w-52"
            >
              <option value="">Tous les statuts</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-6">
          {recipes.isPending ? (
            <div className="flex items-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <span>Chargement des recettes…</span>
            </div>
          ) : recipes.isError ? (
            <div className="flex flex-col items-start gap-3 py-12">
              <p role="alert" className="text-destructive-foreground">
                Impossible de charger les recettes.
              </p>
              <Button variant="outline" onClick={() => void recipes.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : recipes.data.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <p className="text-muted-foreground">Aucune recette pour ces critères.</p>
                <Button asChild>
                  <Link to="/recipes/new">Créer la première recette</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.data.map((recipe) => (
                <li key={recipe.id}>
                  <Link
                    to={`/recipes/${recipe.id}/edit`}
                    className="block rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Card className="h-full hover:border-primary/60">
                      <CardHeader className="gap-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg">{recipe.name}</CardTitle>
                          <Badge tone={STATUS_TONE[recipe.status]}>
                            {STATUS_LABELS[recipe.status]}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{ENGINE_LABELS[recipe.engine]}</span>
                          <span aria-hidden="true">·</span>
                          <Badge tone="accent">v{recipe.version}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Modifiée le {dateFmt.format(new Date(recipe.updatedAt))}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
