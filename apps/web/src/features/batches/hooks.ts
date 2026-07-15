import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type BatchCreateInput,
  batchesApi,
  type BatchStatus,
  type MeasureCreateInput,
} from "@/lib/api";

/** Fabrique de clés de cache : une racine `batches` pour invalider large. */
export const batchKeys = {
  all: ["batches"] as const,
  detail: (id: string) => ["batches", "detail", id] as const,
  measures: (id: string) => ["batches", "measures", id] as const,
  cost: (id: string) => ["batches", "cost", id] as const,
};

/** Détail d'un batch (numéro, statut, réservations). */
export function useBatch(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.detail(id ?? ""),
    queryFn: () => batchesApi.get(id as string),
    enabled: Boolean(id),
  });
}

/** Coût de revient estimé du batch (M5-08) : total, coût au litre, répartition, base. */
export function useBatchCost(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.cost(id ?? ""),
    queryFn: () => batchesApi.cost(id as string),
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

/** Journal chronologique des mesures d'un batch. */
export function useBatchMeasures(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.measures(id ?? ""),
    queryFn: () => batchesApi.measures(id as string),
    enabled: Boolean(id),
  });
}

/** Ajoute une mesure → invalide le journal du batch. */
export function useAddMeasure(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MeasureCreateInput) => batchesApi.addMeasure(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: batchKeys.measures(id) });
    },
  });
}

/** Fait progresser le statut d'un batch → rafraîchit le détail. */
export function useChangeBatchStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: BatchStatus) => batchesApi.changeStatus(id, status),
    onSuccess: (batch) => {
      qc.setQueryData(batchKeys.detail(id), batch);
      void qc.invalidateQueries({ queryKey: batchKeys.all });
    },
  });
}
