/**
 * Resynchronisation de la file offline Jour J (M4-14). À la reconnexion (`online`)
 * et au montage, la file IndexedDB est rejouée **dans l'ordre (`at`)** via `:sync`
 * (M4-06, idempotent). Succès → purge de la file + réconciliation sur la session
 * **serveur** (source de vérité, ADR-08) ; échec réseau → on garde la file et on
 * retentera. Les refus serveur sont signalés (toast) **sans boucler** (entrées purgées).
 */

import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { batchKeys } from "@/features/batches/hooks";
import { dayKeys } from "@/features/day/hooks";
import { dayQueueKeys } from "@/features/day/offline/optimistic";
import { countPending, pendingEvents, removeEvents } from "@/features/day/offline/queue";
import { useDayToasts } from "@/features/day/toast";
import { dayApi } from "@/lib/api";

/**
 * Rejoue la file d'un brassin via `:sync`. Idempotent et sûr à appeler en
 * concurrence légère (V1 = un appareil, ADR-08). No-op si la file est vide.
 */
export async function flushQueue(
  batchId: string,
  qc: QueryClient,
  pushToast: (message: string) => void,
): Promise<void> {
  const pending = await pendingEvents(batchId);
  if (pending.length === 0) return;

  const ordered = [...pending].sort((a, b) => a.event.at - b.event.at);
  let synced;
  try {
    synced = await dayApi.sync(
      batchId,
      ordered.map((e) => ({ clientEventId: e.clientEventId, event: e.event })),
    );
  } catch {
    // Encore hors-ligne / échec réseau : la file est conservée, rejeu au prochain `online`.
    return;
  }

  // Tous les événements envoyés sont retirés (appliqués, ignorés ou refusés) : pas de boucle.
  await removeEvents(ordered.map((e) => e.clientEventId));
  qc.setQueryData(dayKeys.session(batchId), synced);
  void qc.invalidateQueries({ queryKey: dayQueueKeys.count(batchId) });
  void qc.invalidateQueries({ queryKey: dayKeys.deviations(batchId) });
  if (synced.batchStatus === "EN_FERMENTATION") {
    void qc.invalidateQueries({ queryKey: batchKeys.detail(batchId) });
  }

  const rejected = synced.results.filter((r) => r.outcome === "rejected");
  if (rejected.length > 0) {
    pushToast(
      `${rejected.length} action${rejected.length > 1 ? "s" : ""} refusée${
        rejected.length > 1 ? "s" : ""
      } à la synchronisation.`,
    );
  }
}

/**
 * Arme la resynchro d'un brassin : rejoue la file à la reconnexion (`online`) et
 * une fois au montage (au cas où l'appli s'ouvre en ligne avec une file laissée
 * par une session précédente). À monter une fois sur l'écran Jour J.
 */
export function useDaySync(batchId: string): void {
  const qc = useQueryClient();
  const pushToast = useDayToasts((s) => s.push);
  useEffect(() => {
    if (!batchId) return;
    const flush = (): void => {
      void flushQueue(batchId, qc, pushToast);
    };
    window.addEventListener("online", flush);
    if (navigator.onLine) flush();
    return () => window.removeEventListener("online", flush);
  }, [batchId, qc, pushToast]);
}

/** Nombre d'actions en attente dans la file offline (réactif, pour la bannière). */
export function useOfflineQueueCount(batchId: string): number {
  const { data } = useQuery({
    queryKey: dayQueueKeys.count(batchId),
    queryFn: () => countPending(batchId),
    initialData: 0,
    // Lecture IndexedDB locale : doit fonctionner hors-ligne (sinon requête en pause).
    networkMode: "always",
  });
  return data;
}
