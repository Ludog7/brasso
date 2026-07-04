/**
 * Client HTTP de l'API Brasso. En dev, les requêtes relatives passent par le
 * proxy Vite (même origine → cookie de session conservé) ; en prod, Caddy relaie
 * `/auth` vers l'API. `VITE_API_URL` permet de cibler une origine explicite.
 */
const BASE: string = import.meta.env.VITE_API_URL ?? "";

/** Vue publique d'un utilisateur (miroir de `AuthUser` côté API). */
export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/** Erreur HTTP portant le code métier de l'enveloppe `{ error: { code } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { "content-type": "application/json", ...init?.headers },
      ...init,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Impossible de joindre le serveur");
  }

  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const body: unknown = isJson ? await res.json() : null;

  if (!res.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, error?.code ?? "ERROR", error?.message ?? res.statusText);
  }
  return body as T;
}

export const authApi = {
  login: (email: string, password: string): Promise<User> =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }).then((r) => r.user),

  me: (): Promise<User> => request<{ user: User }>("/auth/me").then((r) => r.user),

  logout: (): Promise<{ ok: true }> => request<{ ok: true }>("/auth/logout", { method: "POST" }),
};
