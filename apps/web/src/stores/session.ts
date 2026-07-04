import { create } from "zustand";

import type { User } from "@/lib/api";

/**
 * État de session **UI** (Zustand) : instantané de l'utilisateur courant lu par
 * les gardes de route et le layout. TanStack Query reste la source des appels
 * réseau (`/auth/*`) qui alimentent ce store.
 */
interface SessionState {
  user: User | null;
  setUser: (user: User | null) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
