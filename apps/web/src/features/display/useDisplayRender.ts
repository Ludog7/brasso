/**
 * Synchronisation de la **vue d'affichage temps réel** (M7-13). Charge le rendu d'un
 * écran (`GET /display/screens/:id/render`) et se resynchronise :
 *  - **périodiquement** (intervalle atelier/vitrine, `DISPLAY_REFETCH_MS`) ;
 *  - à toute **invalidation** de la racine `display` (édition de config depuis la même
 *    session — TanStack Query, pas de WebSocket).
 *
 * Le rendu **affiché** ne bascule que lorsque le **jeton de sync** (`syncToken`, hash
 * calculé côté API) change : un poll qui rapporte un rendu identique ne provoque **aucun
 * re-render** (référence stable). Un produit tombé à 0 disparaît, un produit réapprovisionné
 * réapparaît. Sur erreur réseau, on **conserve le dernier rendu** (pas d'écran blanc en
 * salle) et on signale discrètement l'état « hors ligne / resync ».
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { displayApi, type ScreenRender } from "@/lib/api";

import { displayKeys } from "./hooks";

/** Intervalle de resynchronisation par défaut (ms) — atelier/vitrine, wifi variable. */
export const DISPLAY_REFETCH_MS = 20_000;

export interface DisplayRenderState {
  /** Dernier rendu **affiché** (conservé tel quel sur erreur réseau). `null` avant le 1ᵉʳ. */
  render: ScreenRender | null;
  /** Premier chargement en cours (rien à afficher encore). */
  isInitialLoading: boolean;
  /** Le tout premier chargement a échoué (rien à afficher — écran d'erreur + réessayer). */
  isInitialError: boolean;
  /** Un rendu est affiché mais la dernière resynchro a échoué (mode « hors ligne »). */
  isStale: boolean;
  /** Force une resynchronisation immédiate. */
  refetch: () => void;
}

/**
 * Pilote le rendu temps réel d'un écran. `intervalMs` est injectable (tests) ; en usage
 * réel le défaut `DISPLAY_REFETCH_MS` s'applique.
 */
export function useDisplayRender(
  screenId: string,
  intervalMs: number = DISPLAY_REFETCH_MS,
): DisplayRenderState {
  const query = useQuery({
    queryKey: displayKeys.render(screenId),
    queryFn: () => displayApi.render(screenId),
    enabled: screenId.length > 0,
    // Resynchro périodique, y compris hors focus (écran dédié, souvent en arrière-plan).
    refetchInterval: intervalMs,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    // Pas de nouvelle tentative agressive : l'intervalle reprend au tick suivant.
    retry: false,
    staleTime: 0,
    // On garde le rendu en cache tant que la vue est montée (pas d'éviction en salle).
    gcTime: Number.POSITIVE_INFINITY,
  });

  // Rendu affiché : ne bascule qu'au **changement de jeton de sync** (re-render seulement
  // sur changement significatif). Jamais remis à null → conservé sur erreur réseau. La forme
  // fonctionnelle renvoie la **même référence** quand le jeton est inchangé → aucun re-render.
  const [displayed, setDisplayed] = useState<ScreenRender | null>(null);
  useEffect(() => {
    const next = query.data;
    if (!next) return;
    setDisplayed((prev) => (prev && prev.syncToken === next.syncToken ? prev : next));
  }, [query.data]);

  return {
    render: displayed,
    isInitialLoading: displayed === null && query.isPending,
    isInitialError: displayed === null && query.isError,
    isStale: displayed !== null && query.isError,
    refetch: () => void query.refetch(),
  };
}
