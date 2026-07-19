import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  displayApi,
  type DisplayItemInput,
  referentialsApi,
  type ScreenInput,
  type SurfaceInput,
} from "@/lib/api";

/** Clés de cache : racine `display` pour invalider large après écriture. */
export const displayKeys = {
  all: ["display"] as const,
  surfaces: ["display", "surfaces"] as const,
  screens: (surfaceId: string) => ["display", "screens", surfaceId] as const,
  /** Rendu temps réel d'un écran (M7-13) — sous la racine `display` (invalidable). */
  render: (screenId: string) => ["display", "render", screenId] as const,
};

export function useSurfaces(enabled = true) {
  return useQuery({
    queryKey: displayKeys.surfaces,
    queryFn: () => displayApi.listSurfaces(),
    enabled,
  });
}

export function useScreens(surfaceId: string, enabled = true) {
  return useQuery({
    queryKey: displayKeys.screens(surfaceId),
    queryFn: () => displayApi.listScreens(surfaceId),
    enabled,
  });
}

/**
 * Articles **affichables au bar** : conditionnements **et produits finis** (#274).
 *
 * `PRODUIT_FINI` a été ajouté ici — le filtre d'origine (M7-12) ne retenait que
 * `CONDITIONNEMENT`, ce qui était juste à l'époque : rien ne produisait encore
 * de produit fini. Depuis M9-08, le conditionnement d'un brassin en crée un, et
 * c'est **la bière qu'on vient de brasser** qui manquait au sélecteur.
 *
 * Deux requêtes fusionnées plutôt qu'une : `GET /api/catalog-items` ne prend
 * qu'un `kind` à la fois. Élargir le contrat de la route aurait touché un module
 * partagé (référentiels, éditeurs de recettes) pour le seul besoin de ce picker.
 *
 * Les produits finis viennent en tête : ce sont les articles qu'on cherche à
 * afficher après un brassin, et ce sont les plus récents.
 */
export function useCatalogItems(enabled = true) {
  return useQuery({
    queryKey: ["catalog-items", "display-picker"] as const,
    queryFn: async () => {
      const [finished, packaged] = await Promise.all([
        referentialsApi.catalogItems({ kind: "PRODUIT_FINI" }),
        referentialsApi.catalogItems({ kind: "CONDITIONNEMENT" }),
      ]);
      return [...finished, ...packaged];
    },
    enabled,
  });
}

function useInvalidateDisplay() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: displayKeys.all });
}

export function useCreateSurface() {
  const invalidate = useInvalidateDisplay();
  return useMutation({
    mutationFn: (input: SurfaceInput) => displayApi.createSurface(input),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateSurface(id: string) {
  const invalidate = useInvalidateDisplay();
  return useMutation({
    mutationFn: (input: Partial<SurfaceInput>) => displayApi.updateSurface(id, input),
    onSuccess: () => void invalidate(),
  });
}

export function useRemoveSurface() {
  const invalidate = useInvalidateDisplay();
  return useMutation({
    mutationFn: (id: string) => displayApi.removeSurface(id),
    onSuccess: () => void invalidate(),
  });
}

export function useCreateScreen(surfaceId: string) {
  const invalidate = useInvalidateDisplay();
  return useMutation({
    mutationFn: (input: ScreenInput) => displayApi.createScreen(surfaceId, input),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateScreen(id: string) {
  const invalidate = useInvalidateDisplay();
  return useMutation({
    mutationFn: (input: Partial<ScreenInput>) => displayApi.updateScreen(id, input),
    onSuccess: () => void invalidate(),
  });
}

export function useRemoveScreen() {
  const invalidate = useInvalidateDisplay();
  return useMutation({
    mutationFn: (id: string) => displayApi.removeScreen(id),
    onSuccess: () => void invalidate(),
  });
}

/** Remplace la sélection de produits d'un écran (PUT items). */
export function useSetItems(screenId: string) {
  return useMutation({
    mutationFn: (items: DisplayItemInput[]) => displayApi.setItems(screenId, items),
  });
}
