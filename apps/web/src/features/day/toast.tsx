/**
 * Toasts éphémères du Jour J (M4-09). L'écran atelier plein cadre n'a pas de zone
 * de notification : quand la state machine **refuse** un événement (409, ADR-08),
 * on prévient l'opérateur sans toucher à l'état serveur (source de vérité). Petit
 * store Zustand (comme `stores/session`) piloté par `useDayEvent`, rendu par
 * `<DayToaster/>` monté dans la coquille.
 */

import { AlertTriangle, X } from "lucide-react";
import { create } from "zustand";

/** Notification transitoire (tonalité `error` = refus machine, `info` = neutre). */
export interface DayToast {
  id: number;
  message: string;
  tone: "error" | "info";
}

interface ToastState {
  toasts: DayToast[];
  /** Empile un toast (auto-retrait après `AUTO_DISMISS_MS`). */
  push: (message: string, tone?: DayToast["tone"]) => void;
  dismiss: (id: number) => void;
}

/** Durée d'affichage avant auto-retrait (assez long pour une lecture atelier). */
const AUTO_DISMISS_MS = 6000;

let nextId = 0;

export const useDayToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = "error") => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Pile de toasts Jour J (bas-centre), au-dessus du dérouleur. */
export function DayToaster() {
  const toasts = useDayToasts((s) => s.toasts);
  const dismiss = useDayToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={[
            "pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border px-4 py-3 shadow-lg",
            toast.tone === "error"
              ? "border-destructive/50 bg-destructive text-destructive-foreground"
              : "border-border bg-card text-card-foreground",
          ].join(" ")}
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Fermer la notification"
            className="shrink-0 rounded p-1 opacity-80 hover:opacity-100"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
