import type { CatalogKind } from "@brasso/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type InventoryCountInput,
  stockApi,
  type StockItemCreateInput,
  type StockItemUpdateInput,
  type StockMovementInput,
} from "@/lib/api";

/** Clés de cache : une racine `stock` pour invalider large après écriture. */
export const stockKeys = {
  all: ["stock"] as const,
  items: (kind?: CatalogKind) => ["stock", "items", kind ?? "all"] as const,
  alerts: () => ["stock", "alerts"] as const,
};

/** Catalogue + niveaux, filtrable par `kind`. */
export function useStockItems(kind?: CatalogKind) {
  return useQuery({
    queryKey: stockKeys.items(kind),
    queryFn: () => stockApi.items(kind),
  });
}

/** Articles sous leur seuil (bandeau d'alertes). */
export function useStockAlerts() {
  return useQuery({
    queryKey: stockKeys.alerts(),
    queryFn: () => stockApi.alerts(),
  });
}

/** Invalide toutes les vues stock (niveaux + alertes) après une écriture. */
function useInvalidateStock() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: stockKeys.all });
}

export function useCreateItem() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: StockItemCreateInput) => stockApi.createItem(input),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateItem(id: string) {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: StockItemUpdateInput) => stockApi.updateItem(id, input),
    onSuccess: () => void invalidate(),
  });
}

export function useCreateMovement() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: StockMovementInput) => stockApi.createMovement(input),
    onSuccess: () => void invalidate(),
  });
}

export function useApplyInventory() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (counts: InventoryCountInput[]) => stockApi.applyInventory(counts),
    onSuccess: () => void invalidate(),
  });
}
