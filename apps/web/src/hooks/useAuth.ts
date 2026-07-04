import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, authApi, type User } from "@/lib/api";
import { useSession } from "@/stores/session";

const ME_KEY = ["auth", "me"] as const;

/**
 * Amorçage de session : appelle `/auth/me` au démarrage. Un 401 signifie
 * simplement « non connecté » (pas une erreur) ; les autres échecs remontent.
 */
export function useBootstrapSession() {
  const setUser = useSession((s) => s.setUser);
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        const user = await authApi.me();
        setUser(user);
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          return null;
        }
        throw err;
      }
    },
  });
}

export function useLogin() {
  const setUser = useSession((s) => s.setUser);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (user) => {
      setUser(user);
      qc.setQueryData(ME_KEY, user);
    },
  });
}

export function useLogout() {
  const clear = useSession((s) => s.clear);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}
