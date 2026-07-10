import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type BatchCreateInput, batchesApi } from "@/lib/api";

/** Fabrique de clés de cache : une racine `batches` pour invalider large. */
export const batchKeys = {
  all: ["batches"] as const,
  detail: (id: string) => ["batches", "detail", id] as const,
};

/** Détail d'un batch (numéro, statut, réservations). */
export function useBatch(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.detail(id ?? ""),
    queryFn: () => batchesApi.get(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Planifie un batch (POST /api/batches). En succès, amorce le cache détail avec le
 * batch créé et invalide les listes ; l'appelant redirige vers `/batches/:id`.
 */
export function usePlanBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BatchCreateInput) => batchesApi.plan(input),
    onSuccess: (result) => {
      qc.setQueryData(batchKeys.detail(result.batch.id), result.batch);
      void qc.invalidateQueries({ queryKey: batchKeys.all });
    },
  });
}
