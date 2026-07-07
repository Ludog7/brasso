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

// ─────────────────────────────────────────────────────────────────────────────
// Recettes (M2-01 … M2-04). Types alignés sur les vues du repository API
// (`RecipeSummary` / `RecipeWithDetails`). Valeurs d'enum recopiées de `core`
// (mêmes littéraux) plutôt qu'importées, pour éviter une dépendance workspace au
// stade du shell : les éditeurs par moteur (M2-06+) tireront `@brasso/core`.
// ─────────────────────────────────────────────────────────────────────────────

export type RecipeEngine = "BEER" | "ALT_FERMENTED" | "SOFT_DRINK";
export type RecipeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** Vue résumée d'une recette (liste). Dates sérialisées en ISO 8601. */
export interface RecipeSummary {
  id: string;
  familyId: string;
  version: number;
  name: string;
  engine: RecipeEngine;
  status: RecipeStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BeerDetails {
  styleBjcp: string | null;
  targetOg: number | null;
  targetFg: number | null;
  targetIbu: number | null;
  targetEbc: number | null;
  boilTimeMin: number | null;
  efficiency: number | null;
  batchVolumeL: number | null;
}

export interface AltDetails {
  baseType: string;
  targetPh: number | null;
  stabilizationMethod: string | null;
  residualSugarRisk: boolean;
  batchVolumeL: number | null;
}

export interface SoftDetails {
  sugarConcentration: number | null;
  targetPh: number | null;
  storageMode: string | null;
  stabilizationMethod: string | null;
  batchVolumeL: number | null;
}

/** Vue détaillée : commun + détail moteur (une seule table 1-1) + sous-ressources. */
export interface RecipeDetail extends RecipeSummary {
  beerDetails: BeerDetails | null;
  altDetails: AltDetails | null;
  softDetails: SoftDetails | null;
  ingredients: unknown[];
  steps: unknown[];
}

/**
 * Corps de création — union discriminée par `engine` (miroir de `recipeCreateBody`
 * côté API). ALT_FERMENTED exige `baseType` ; BEER/SOFT tolèrent un détail vide.
 */
export type RecipeCreateInput =
  | { engine: "BEER"; name: string; notes?: string; beerDetails?: Partial<BeerDetails> }
  | { engine: "ALT_FERMENTED"; name: string; notes?: string; altDetails: { baseType: string } }
  | { engine: "SOFT_DRINK"; name: string; notes?: string; softDetails?: Partial<SoftDetails> };

/** Patch commun + détail moteur (mise à jour partielle du DRAFT). */
export interface RecipeUpdateInput {
  name?: string;
  notes?: string | null;
  beerDetails?: Partial<BeerDetails>;
  altDetails?: Partial<AltDetails>;
  softDetails?: Partial<SoftDetails>;
}

export interface RecipeListFilters {
  engine?: RecipeEngine;
  status?: RecipeStatus;
}

export const recipesApi = {
  list: (filters: RecipeListFilters = {}): Promise<RecipeSummary[]> => {
    const qs = new URLSearchParams();
    if (filters.engine) qs.set("engine", filters.engine);
    if (filters.status) qs.set("status", filters.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ recipes: RecipeSummary[] }>(`/api/recipes${suffix}`).then((r) => r.recipes);
  },

  get: (id: string): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}`).then((r) => r.recipe),

  create: (input: RecipeCreateInput): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>("/api/recipes", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.recipe),

  update: (id: string, input: RecipeUpdateInput): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.recipe),
};
