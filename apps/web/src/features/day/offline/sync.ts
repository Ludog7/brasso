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
import {
  countPending,
  pendingCyclePlan,
  pendingEvents,
  removeCyclePlan,
  removeEvents,
} from "@/features/day/offline/queue";
import { useDayToasts } from "@/features/day/toast";
import { ApiError, batchesApi, type CyclePlanInput, dayApi } from "@/lib/api";

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
 * Rejoue la **planification de cycle** mise en attente en fin d'ensemencement
 * (M9-12). `POST /batches/:id/milestones` est idempotent (M9-07) : un rejeu sur
 * une séquence déjà créée renvoie `created: false` sans rien dupliquer.
 *
 * Le `pitchedAt` figé à la saisie part avec le corps : c'est lui qui date le
 * cycle, pas l'instant de la reconnexion.
 */
export async function flushCyclePlan(
  batchId: string,
  qc: QueryClient,
  pushToast: (message: string) => void,
): Promise<void> {
  const queued = await pendingCyclePlan(batchId);
  if (!queued) return;

  try {
    await batchesApi.planCycle(batchId, queued.payload as CyclePlanInput);
  } catch (error) {
    if (!isDefinitiveRefusal(error)) return;
    // Refus définitif : la garder ferait boucler la resynchro à chaque
    // reconnexion. On la retire, mais on le **dit** — une planification perdue
    // en silence laisserait un brassin sans dates que personne ne viendrait
    // chercher.
    await removeCyclePlan(batchId);
    void qc.invalidateQueries({ queryKey: dayQueueKeys.count(batchId) });
    pushToast("Planification du cycle refusée à la synchronisation.");
    return;
  }

  await removeCyclePlan(batchId);
  void qc.invalidateQueries({ queryKey: batchKeys.milestones(batchId) });
  void qc.invalidateQueries({ queryKey: dayQueueKeys.count(batchId) });
}

/**
 * L'échec est-il **définitif** (inutile de retenter) ?
 *
 * Seuls le sont les refus que le serveur opposera à l'identique : payload
 * invalide (400/422), brassin disparu (404), conflit (409). Restent en file :
 * la panne réseau (`status: 0`), les 5xx, et **401/403** — une session expirée
 * pendant une nuit hors ligne se résout à la reconnexion de l'opérateur, et
 * jeter sa saisie pour cette raison serait la perdre au pire moment.
 */
function isDefinitiveRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401 || error.status === 403) return false;
  return error.status >= 400 && error.status < 500;
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
      // Les événements d'abord : la planification de cycle suit l'ensemencement,
      // et la rejouer avant lui daterait le cycle sur une étape pas encore
      // remontée. Les deux sont indépendants côté serveur, l'ordre reste le
      // bon récit pour l'opérateur qui regarde la bannière se vider.
      void flushQueue(batchId, qc, pushToast).then(() => flushCyclePlan(batchId, qc, pushToast));
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
