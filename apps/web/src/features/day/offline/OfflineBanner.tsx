/**
 * Bannière d'état offline du Jour J (M4-14). Rend visible le mode dégradé et le
 * **nombre d'actions en attente** de synchro : hors-ligne, l'atelier continue à
 * dérouler (état optimiste local) sans rien perdre ; à la reconnexion, la file est
 * rejouée (`:sync`) et la bannière se vide. Muette quand tout est synchronisé.
 */

import { CloudOff, RefreshCw } from "lucide-react";

import { useOnlineStatus } from "@/features/day/hooks";
import { useOfflineQueueCount } from "@/features/day/offline/sync";

export function OfflineBanner({ batchId }: { batchId: string }) {
  const online = useOnlineStatus();
  const pending = useOfflineQueueCount(batchId);

  // En ligne et rien en attente : aucune bannière (état nominal).
  if (online && pending === 0) return null;

  const plural = pending > 1 ? "s" : "";

  if (!online) {
    const message =
      pending > 0
        ? `Hors-ligne — ${pending} action${plural} en attente. Le déroulé continue et sera synchronisé à la reconnexion.`
        : "Hors-ligne — le déroulé continue ; tout est déjà synchronisé.";
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-200"
      >
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
    );
  }

  // En ligne avec des actions restantes : synchronisation en cours.
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-primary/15 px-4 py-2 text-center text-sm text-foreground"
    >
      <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      <span>
        Synchronisation de {pending} action{plural}…
      </span>
    </div>
  );
}
