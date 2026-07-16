import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { memberKeys } from "@/features/members/hooks";
import { contributionsApi } from "@/lib/api";

/** Clé de cache de la liste « à rapprocher ». */
export const contributionKeys = {
  pending: ["contributions", "pending"] as const,
};

/** Cotisations en attente de rapprochement. `enabled` : masqué hors rôle lecteur. */
export function usePendingContributions(enabled = true) {
  return useQuery({
    queryKey: contributionKeys.pending,
    queryFn: () => contributionsApi.pending(),
    enabled,
  });
}

/**
 * Rapproche une cotisation à un membre. Invalide la liste (la cotisation quitte
 * « à rapprocher ») **et** les membres (badge de statut recalculé → A_JOUR).
 */
export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, memberId }: { id: string; memberId: string }) =>
      contributionsApi.reconcile(id, memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contributionKeys.pending });
      void qc.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}
