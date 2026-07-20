/**
 * Toasts éphémères de l'écran Stock (M5-07) : confirmation d'un mouvement ou d'un
 * inventaire appliqué. Petit store Zustand (comme le toaster Jour J), rendu par
 * `<StockToaster/>` monté dans la page.
 */

import { CheckCircle2, X } from "lucide-react";
import { create } from "zustand";

export interface StockToast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: StockToast[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 5000;
let nextId = 0;

export const useStockToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message) => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function StockToaster() {
  const toasts = useStockToasts((s) => s.toasts);
  const dismiss = useStockToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-lg"
        >
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
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
