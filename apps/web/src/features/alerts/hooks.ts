import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AlertListFilters,
  alertsApi,
  type AlertStockAdjustment,
  referentialsApi,
} from "@/lib/api";

/** Clés de cache : racine `alerts` pour invalider large (liste + compteur) après résolution. */
export const alertKeys = {
  all: ["alerts"] as const,
  list: (filters: AlertListFilters) => ["alerts", "list", filters] as const,
};

/** Liste des anomalies (filtrable status/type). `enabled` : désactivé si écran masqué. */
export function useAlerts(filters: AlertListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: alertKeys.list(filters),
    queryFn: () => alertsApi.list(filters),
    enabled,
  });
}

/**
 * Nombre d'anomalies **ouvertes** (compteur de navigation). Partage le cache de la
 * liste `status=OPEN` (même clé) → se rafraîchit à la résolution ; `select` projette
 * juste le total.
 */
export function useOpenAlertsCount(enabled = true) {
  return useQuery({
    queryKey: alertKeys.list({ status: "OPEN" }),
    queryFn: () => alertsApi.list({ status: "OPEN" }),
    select: (alerts) => alerts.length,
    enabled,
  });
}

/** Articles de catalogue (pour l'ajustement de stock manuel d'une résolution). */
export function useCatalogItems(enabled = true) {
  return useQuery({
    queryKey: ["catalog-items", "alert-adjustment"] as const,
    queryFn: () => referentialsApi.catalogItems({}),
    enabled,
  });
}

/**
 * Résout une anomalie (+ ajustement de stock manuel optionnel). Invalide large : la
 * liste (l'anomalie quitte `OPEN`) **et** le compteur de navigation.
 */
export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stockAdjustment }: { id: string; stockAdjustment?: AlertStockAdjustment }) =>
      alertsApi.resolve(id, stockAdjustment),
    onSuccess: () => void qc.invalidateQueries({ queryKey: alertKeys.all }),
  });
}
