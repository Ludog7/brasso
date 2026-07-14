/**
 * État **optimiste** local du Jour J hors-ligne (M4-14). Le serveur reste la source
 * de vérité (ADR-08) ; hors connexion, on rejoue le **réducteur pur** `transition`
 * (M1-13) côté client pour faire avancer l'UI, puis on réconcilie à la synchro.
 *
 * `transition` étant **déterministe**, l'état optimiste converge vers l'état serveur
 * au rejeu de la même file (mêmes événements, mêmes `at`). Un refus local (motif
 * `rejection`) est remonté comme un `ApiError` 409 : même toast qu'un refus serveur.
 */

import {
  currentStep,
  type DayEvent,
  isFinished,
  phaseToDayPhase,
  stepTiming,
  transition,
} from "@brasso/core";

import { ApiError, type DayEventRequest, type DaySession } from "@/lib/api";

/** Clé de cache du **compteur** de file offline (bannière). */
export const dayQueueKeys = {
  count: (batchId: string) => ["dayQueue", batchId] as const,
};

/**
 * Convertit une intention d'UI (`DayEventRequest`, sans horloge) en événement pur
 * de la machine en y **figeant l'instant `at`** capté à l'action. Les champs des
 * deux formes sont alignés (seul `at` est ajouté).
 */
export function toWireEvent(request: DayEventRequest, at: number): DayEvent {
  return { ...request, at } as DayEvent;
}

/**
 * Applique un événement à la session **en local** (optimiste). Renvoie la session
 * mise à jour (état, phase, timings, révision + 1, clôture éventuelle). Lève un
 * `ApiError` 409 si la machine **refuse** l'événement — l'appelant laisse alors
 * l'état inchangé (comme un refus serveur).
 */
export function applyOptimistic(session: DaySession, event: DayEvent): DaySession {
  const result = transition(session.state, event);
  if (result.rejection !== undefined) {
    throw new ApiError(409, "DAY_EVENT_REJECTED", result.rejection);
  }
  const state = result.state;
  const finished = isFinished(state);
  return {
    ...session,
    phase: phaseToDayPhase(currentStep(state)?.phase ?? null),
    revision: session.revision + 1,
    plan: state.plan,
    state,
    timings: stepTiming(state, event.at),
    batchStatus: finished ? "EN_FERMENTATION" : session.batchStatus,
  };
}
