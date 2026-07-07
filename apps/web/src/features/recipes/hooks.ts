import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type RecipeCreateInput,
  type RecipeDetail,
  type RecipeListFilters,
  recipesApi,
  type RecipeUpdateInput,
} from "@/lib/api";

/** Fabrique de clés de cache : une seule racine `recipes` pour invalider large. */
export const recipeKeys = {
  all: ["recipes"] as const,
  list: (filters: RecipeListFilters) => ["recipes", "list", filters] as const,
  detail: (id: string) => ["recipes", "detail", id] as const,
};

/** Liste des recettes, filtrable par moteur et statut (filtrage côté API). */
export function useRecipes(filters: RecipeListFilters = {}) {
  return useQuery({
    queryKey: recipeKeys.list(filters),
    queryFn: () => recipesApi.list(filters),
  });
}

/** Détail d'une recette (commun + détail moteur). */
export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipesApi.get(id),
  });
}

/** Création d'un brouillon → invalide les listes ; renvoie la recette créée. */
export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeCreateInput) => recipesApi.create(input),
    onSuccess: (recipe) => {
      qc.setQueryData(recipeKeys.detail(recipe.id), recipe);
      void qc.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

/** Mise à jour du brouillon → met à jour le cache détail et invalide les listes. */
export function useUpdateRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeUpdateInput) => recipesApi.update(id, input),
    onSuccess: (recipe: RecipeDetail) => {
      qc.setQueryData(recipeKeys.detail(id), recipe);
      void qc.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}
