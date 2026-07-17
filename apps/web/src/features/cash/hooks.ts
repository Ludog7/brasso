import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  mappingApi,
  type MappingCreateInput,
  type MappingListFilters,
  type MappingUpdateInput,
  referentialsApi,
  type TransactionListFilters,
  transactionsApi,
} from "@/lib/api";

/** Clés de cache : racine `mapping`/`transactions` pour invalider large après écriture. */
export const mappingKeys = {
  all: ["mapping"] as const,
  list: (filters: MappingListFilters) => ["mapping", "list", filters] as const,
};

export const transactionKeys = {
  all: ["transactions"] as const,
  list: (filters: TransactionListFilters) => ["transactions", "list", filters] as const,
};

/** Mappings SKU (lecture). `enabled` : désactivé quand l'écran est masqué (rôle non habilité). */
export function useMappings(filters: MappingListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: mappingKeys.list(filters),
    queryFn: () => mappingApi.list(filters),
    enabled,
  });
}

/** Transactions externes read-only (filtrables status/kind). `enabled` comme ci-dessus. */
export function useTransactions(filters: TransactionListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: () => transactionsApi.list(filters),
    enabled,
  });
}

/** Articles de catalogue (pour lier un mapping) — chargés à l'ouverture du formulaire. */
export function useCatalogItems(enabled = true) {
  return useQuery({
    queryKey: ["catalog-items", "mapping-picker"] as const,
    queryFn: () => referentialsApi.catalogItems({}),
    enabled,
  });
}

function useInvalidateMappings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: mappingKeys.all });
}

export function useCreateMapping() {
  const invalidate = useInvalidateMappings();
  return useMutation({
    mutationFn: (input: MappingCreateInput) => mappingApi.create(input),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateMapping(id: string) {
  const invalidate = useInvalidateMappings();
  return useMutation({
    mutationFn: (input: MappingUpdateInput) => mappingApi.update(id, input),
    onSuccess: () => void invalidate(),
  });
}

export function useDeleteMapping() {
  const invalidate = useInvalidateMappings();
  return useMutation({
    mutationFn: (id: string) => mappingApi.remove(id),
    onSuccess: () => void invalidate(),
  });
}
