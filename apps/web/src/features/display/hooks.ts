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

/** Articles conditionnés du catalogue (produits affichables sur un écran). */
export function useCatalogItems(enabled = true) {
  return useQuery({
    queryKey: ["catalog-items", "display-picker"] as const,
    queryFn: () => referentialsApi.catalogItems({ kind: "CONDITIONNEMENT" }),
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
