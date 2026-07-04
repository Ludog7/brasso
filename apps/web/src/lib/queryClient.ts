import { QueryClient } from "@tanstack/react-query";

/** Réglages prudents pour l'atelier (wifi instable) : peu de refetch agressif. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
