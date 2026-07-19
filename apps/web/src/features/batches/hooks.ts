import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type BatchCreateInput,
  batchesApi,
  type BatchOverviewFilters,
  type BatchStatus,
  type MeasureCreateInput,
} from "@/lib/api";

/** Fabrique de clés de cache : une racine `batches` pour invalider large. */
export const batchKeys = {
  all: ["batches"] as const,
  detail: (id: string) => ["batches", "detail", id] as const,
  measures: (id: string) => ["batches", "measures", id] as const,
  cost: (id: string) => ["batches", "cost", id] as const,
  overview: (filters: BatchOverviewFilters) => ["batches", "overview", filters] as const,
  milestones: (id: string) => ["batches", "milestones", id] as const,
  volumes: (id: string) => ["batches", "volumes", id] as const,
  cycleDefaults: (id: string) => ["batches", "cycle-defaults", id] as const,
};

/**
 * Vue « Brassins » (M9-09) — un seul appel pour toute la liste. Les filtres font
 * partie de la clé de cache : changer un filtre est une autre question, pas une
 * invalidation.
 */
export function useBatchesOverview(filters: BatchOverviewFilters = {}) {
  return useQuery({
    queryKey: batchKeys.overview(filters),
    queryFn: () => batchesApi.overview(filters),
    // La liste doit refléter l'atelier : une échéance franchie pendant qu'on la
    // regarde n'a pas à attendre un rechargement de page.
    staleTime: 30_000,
  });
}

/** Jalons datés du cycle post-ensemencement d'un brassin (M9-07). */
export function useBatchMilestones(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.milestones(id ?? ""),
    queryFn: () => batchesApi.milestones(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Défauts de cycle d'un brassin (M9-16) : durées à pré-remplir, fuseau de
 * l'instance et présence d'un dry hop.
 *
 * `staleTime` long : ce sont des réglages d'instance et une recette figée, rien
 * qui bouge pendant qu'on remplit un formulaire. Les recharger à chaque focus
 * ferait clignoter un formulaire ouvert en fin de Jour J.
 */
export function useBatchCycleDefaults(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.cycleDefaults(id ?? ""),
    queryFn: () => batchesApi.cycleDefaults(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

/** Chaîne des volumes et rendement de conditionnement d'un brassin (M9-06). */
export function useBatchVolumes(id: string | undefined) {
  return useQuery({
    queryKey: batchKeys.volumes(id ?? ""),
    queryFn: () => batchesApi.volumes(id as string),
    enabled: Boolean(id),
  });
}

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
