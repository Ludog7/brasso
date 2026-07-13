/**
 * Hooks de la session Jour J (M4-08). `useDaySession` lit l'état serveur (source
 * de vérité, ADR-08) via TanStack Query ; `useStartDay` démarre le déroulé ;
 * `useOnlineStatus` expose l'état de connexion pour l'indicateur atelier.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { batchKeys } from "@/features/batches/hooks";
import { ApiError, dayApi, type DaySession } from "@/lib/api";

/** Fabrique de clés de cache Jour J. */
export const dayKeys = {
  session: (batchId: string) => ["day", batchId] as const,
};

/**
 * Session Jour J d'un batch. Un **404** (aucune session ouverte) n'est pas une
 * erreur : la requête renvoie `null` (→ l'écran propose « Démarrer »).
 */
export function useDaySession(batchId: string | undefined) {
  return useQuery({
    queryKey: dayKeys.session(batchId ?? ""),
    enabled: Boolean(batchId),
    queryFn: async (): Promise<DaySession | null> => {
      try {
        return await dayApi.get(batchId as string);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

/**
 * Démarre le Jour J (idempotent). En succès, amorce le cache session et invalide
 * le détail du batch (dont le statut est passé `EN_BRASSAGE`).
 */
export function useStartDay(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => dayApi.start(batchId),
    onSuccess: (session) => {
      qc.setQueryData(dayKeys.session(batchId), session);
      void qc.invalidateQueries({ queryKey: batchKeys.detail(batchId) });
    },
  });
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** État de connexion (`navigator.onLine` + events `online`/`offline`) — indicateur atelier. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
