/**
 * Hooks de la session Jour J (M4-08). `useDaySession` lit l'état serveur (source
 * de vérité, ADR-08) via TanStack Query ; `useStartDay` démarre le déroulé ;
 * `useOnlineStatus` expose l'état de connexion pour l'indicateur atelier.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { batchKeys } from "@/features/batches/hooks";
import { applyOptimistic, dayQueueKeys, toWireEvent } from "@/features/day/offline/optimistic";
import { enqueueEvent } from "@/features/day/offline/queue";
import { useDayToasts } from "@/features/day/toast";
import {
  ApiError,
  dayApi,
  type DayEventRequest,
  type DaySession,
  type DeviationEntry,
} from "@/lib/api";

/** Fabrique de clés de cache Jour J. */
export const dayKeys = {
  session: (batchId: string) => ["day", batchId] as const,
  deviations: (batchId: string) => ["day", batchId, "deviations"] as const,
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
 * Journal des écarts de procédure du batch (M4-12) — **lecture seule**. Rafraîchi
 * automatiquement après un `FORCE_STEP` (cf. `useDayEvent`). Ne dépend pas d'une
 * session ouverte : renvoie une liste vide s'il n'y a aucun forçage.
 */
export function useDeviations(batchId: string | undefined) {
  return useQuery({
    queryKey: dayKeys.deviations(batchId ?? ""),
    enabled: Boolean(batchId),
    queryFn: (): Promise<DeviationEntry[]> => dayApi.deviations(batchId as string),
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

/** Issue d'un événement : appliqué en ligne (serveur) ou mis en file hors-ligne (optimiste). */
interface DayEventOutcome {
  mode: "online" | "offline";
  session: DaySession;
}

/**
 * Envoie un événement au dérouleur. **En ligne** (`POST /day/events`, M4-05) : la
 * session renvoyée (source de vérité, ADR-08) remplace le cache `['day', batchId]`.
 * **Hors-ligne** (M4-14) : `at` est capté, l'événement est validé/appliqué en local
 * (réducteur pur, optimiste) puis **mis en file IndexedDB** ; la resync (`useDaySync`)
 * le rejouera via `:sync` à la reconnexion. Un **refus** de la machine (409, serveur
 * ou local) déclenche un **toast** sans toucher à l'état — l'écran reste sur l'étape.
 */
export function useDayEvent(batchId: string) {
  const qc = useQueryClient();
  const pushToast = useDayToasts((s) => s.push);
  return useMutation({
    // `always` : la mutation doit s'exécuter **même hors-ligne** (sinon TanStack la met
    // en pause) pour capter l'événement dans la file locale (M4-14).
    networkMode: "always",
    mutationFn: async (request: DayEventRequest): Promise<DayEventOutcome> => {
      if (navigator.onLine) {
        return { mode: "online", session: await dayApi.postEvent(batchId, request) };
      }
      // Hors-ligne : figer `at`, appliquer en local (peut lever un 409), puis mettre en file.
      const event = toWireEvent(request, Date.now());
      const current = qc.getQueryData<DaySession>(dayKeys.session(batchId));
      if (!current) {
        throw new ApiError(0, "NETWORK", "Session Jour J indisponible hors-ligne.");
      }
      const optimistic = applyOptimistic(current, event);
      await enqueueEvent({ clientEventId: crypto.randomUUID(), batchId, event });
      return { mode: "offline", session: optimistic };
    },
    onSuccess: ({ mode, session }, request) => {
      qc.setQueryData(dayKeys.session(batchId), session);
      if (mode === "offline") {
        // File modifiée → rafraîchir le compteur de la bannière. Pas d'invalidation de
        // session : hors-ligne, un refetch échouerait et écraserait l'état optimiste.
        void qc.invalidateQueries({ queryKey: dayQueueKeys.count(batchId) });
        return;
      }
      void qc.invalidateQueries({ queryKey: dayKeys.session(batchId) });
      // Un forçage vient d'écrire un écart : rafraîchir le journal (M4-12).
      if (request.type === "FORCE_STEP") {
        void qc.invalidateQueries({ queryKey: dayKeys.deviations(batchId) });
      }
      if (session.batchStatus === "EN_FERMENTATION") {
        void qc.invalidateQueries({ queryKey: batchKeys.detail(batchId) });
      }
    },
    onError: (error) => {
      const rejected = error instanceof ApiError && error.status === 409;
      pushToast(rejected ? error.message : "Action impossible. Vérifie la connexion et réessaie.");
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

/**
 * Horloge locale qui bat à intervalle (défaut 1 s) pour animer le compte à rebours
 * du palier (M4-10). N'est **pas** l'autorité : `timer.startedAt` reste horodaté
 * serveur (ADR-08) ; on ne fait que raffraîchir l'affichage de `stepTiming` côté
 * client. Passer `active=false` (statut sans timer) coupe l'intervalle.
 */
export function useNow(active = true, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
