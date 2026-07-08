import type { IngredientCategory, RecipeIngredientInput, RecipeStepInput } from "@brasso/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type RecipeCreateInput,
  type RecipeDetail,
  type RecipeListFilters,
  recipesApi,
  type RecipeUpdateInput,
  referentialsApi,
} from "@/lib/api";

/** Fabrique de clés de cache : une seule racine `recipes` pour invalider large. */
export const recipeKeys = {
  all: ["recipes"] as const,
  list: (filters: RecipeListFilters) => ["recipes", "list", filters] as const,
  detail: (id: string) => ["recipes", "detail", id] as const,
  family: (familyId: string) => ["recipes", "family", familyId] as const,
};

/** Liste des recettes, filtrable par moteur et statut (filtrage côté API). */
export function useRecipes(filters: RecipeListFilters = {}) {
  return useQuery({
    queryKey: recipeKeys.list(filters),
    queryFn: () => recipesApi.list(filters),
  });
}

/** Versions d'une même famille (`familyId`) — alimente le sélecteur de versions (M2-09). */
export function useRecipeFamily(familyId: string | undefined) {
  return useQuery({
    queryKey: recipeKeys.family(familyId ?? ""),
    queryFn: () => recipesApi.list({ familyId }),
    enabled: Boolean(familyId),
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

/** Payload de sauvegarde complète d'un brouillon (détails + sous-ressources). */
export interface RecipeDraftSave {
  update: RecipeUpdateInput;
  ingredients: RecipeIngredientInput[];
  steps: RecipeStepInput[];
}

/**
 * Sauvegarde complète d'un brouillon en une action UI : PATCH des détails puis
 * remplacement des ingrédients et des étapes (M2-02). Séquentiel — la dernière
 * réponse porte l'état frais persisté. Un seul `isPending`/`isError` pour le
 * bouton « Enregistrer » de l'éditeur moteur.
 */
export function useSaveRecipeDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: RecipeDraftSave): Promise<RecipeDetail> => {
      await recipesApi.update(id, payload.update);
      await recipesApi.replaceIngredients(id, payload.ingredients);
      return recipesApi.replaceSteps(id, payload.steps);
    },
    onSuccess: (recipe) => {
      qc.setQueryData(recipeKeys.detail(id), recipe);
      void qc.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

// ── Cycle de vie (M2-09, ADR-07) ─────────────────────────────────────────────

/**
 * Publie un brouillon (`DRAFT → PUBLISHED`). En cas de 422, l'erreur porte les
 * manquements (cf. `publicationErrors`) ; le cache n'est pas touché. En succès,
 * met à jour le détail et invalide les listes / la famille.
 */
export function usePublishRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recipesApi.publish(id),
    onSuccess: (recipe) => {
      qc.setQueryData(recipeKeys.detail(id), recipe);
      void qc.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

/**
 * Crée une nouvelle version (n+1) depuis une recette publiée. Renvoie le brouillon
 * créé (nouvel `id`, même `familyId`) : l'appelant redirige vers son éditeur.
 */
export function useNewVersionRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recipesApi.newVersion(id),
    onSuccess: (recipe) => {
      qc.setQueryData(recipeKeys.detail(recipe.id), recipe);
      void qc.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

/** Archive une recette publiée (`PUBLISHED → ARCHIVED`). */
export function useArchiveRecipe(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recipesApi.archive(id),
    onSuccess: (recipe) => {
      qc.setQueryData(recipeKeys.detail(id), recipe);
      void qc.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

// ── Référentiels éditeur (M2-04) ─────────────────────────────────────────────

export const referentialKeys = {
  bjcp: (search: string) => ["referentials", "bjcp", search] as const,
  catalog: (category: IngredientCategory, search: string) =>
    ["referentials", "catalog", category, search] as const,
};

/** Styles BJCP (référence statique servie par l'API M2-04). Peu volatile. */
export function useBjcpStyles(search = "") {
  return useQuery({
    queryKey: referentialKeys.bjcp(search),
    queryFn: () => referentialsApi.bjcpStyles(search || undefined),
    staleTime: 5 * 60_000,
  });
}

/** Catalogue d'ingrédients filtré par catégorie (picker éditeur). */
export function useCatalogItems(category: IngredientCategory, search = "") {
  return useQuery({
    queryKey: referentialKeys.catalog(category, search),
    queryFn: () => referentialsApi.catalogItems({ category, search: search || undefined }),
    staleTime: 5 * 60_000,
  });
}
