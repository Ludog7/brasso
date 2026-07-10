/**
 * Client HTTP de l'API Brasso. En dev, les requêtes relatives passent par le
 * proxy Vite (même origine → cookie de session conservé) ; en prod, Caddy relaie
 * `/auth` vers l'API. `VITE_API_URL` permet de cibler une origine explicite.
 */
import type {
  BjcpStyle,
  CatalogKind,
  EquipmentProfileInput,
  IngredientCategory,
  IngredientUse,
  ProcessStepType,
  RecipeIngredientInput,
  RecipeStepInput,
  StockUnit,
} from "@brasso/core";

const BASE: string = import.meta.env.VITE_API_URL ?? "";

/** Vue publique d'un utilisateur (miroir de `AuthUser` côté API). */
export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/** Erreur HTTP portant le code métier de l'enveloppe `{ error: { code, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Charge structurée des erreurs < 500 (ex. manquements de publication, 422). */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Extrait les manquements d'un refus de publication (422 `NOT_PUBLISHABLE`, ADR-06).
 * Renvoie la liste des messages (déjà rédigés ADR-11) si l'erreur est bien un refus
 * de publication ; `null` pour toute autre erreur (à traiter génériquement).
 */
export function publicationErrors(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== "NOT_PUBLISHABLE") {
    return null;
  }
  const details = error.details;
  if (details && typeof details === "object" && "errors" in details) {
    const errors = (details as { errors: unknown }).errors;
    if (Array.isArray(errors) && errors.every((e) => typeof e === "string")) {
      return errors as string[];
    }
  }
  return [];
}

/**
 * Extrait les messages d'un import refusé (422 `IMPORT_INVALID`, M2-12) : parse
 * ou validation échouée. Renvoie la liste de libellés lisibles si l'erreur est bien
 * un refus d'import ; `null` sinon (à traiter génériquement).
 */
export function importErrors(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== "IMPORT_INVALID") {
    return null;
  }
  const details = error.details;
  if (details && typeof details === "object" && "messages" in details) {
    const messages = (details as { messages: unknown }).messages;
    if (Array.isArray(messages) && messages.every((m) => typeof m === "string")) {
      return messages as string[];
    }
  }
  return [];
}

/** Détecte le format d'un fichier importé d'après son contenu (XML BeerXML vs JSON). */
export function detectImportFormat(content: string): "beerxml" | "json" {
  return content.trimStart().startsWith("<") ? "beerxml" : "json";
}

/** Nom de fichier proposé par l'API dans `Content-Disposition`, si présent. */
function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  return /filename="?([^"]+)"?/.exec(header)?.[1];
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
    throw new ApiError(
      res.status,
      error?.code ?? "ERROR",
      error?.message ?? res.statusText,
      error?.details,
    );
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

/** Ingrédient d'une recette (miroir de `RecipeIngredientView` côté API). */
export interface RecipeIngredientView {
  id: string;
  catalogItemId: string | null;
  name: string;
  category: IngredientCategory;
  use: IngredientUse | null;
  amount: number;
  unit: StockUnit;
  timeMinutes: number | null;
  sortOrder: number;
  params: unknown;
}

/** Étape de process d'une recette (miroir de `RecipeStepView` côté API). */
export interface RecipeStepView {
  id: string;
  type: ProcessStepType;
  name: string | null;
  sortOrder: number;
  params: unknown;
}

/** Vue détaillée : commun + détail moteur (une seule table 1-1) + sous-ressources. */
export interface RecipeDetail extends RecipeSummary {
  beerDetails: BeerDetails | null;
  altDetails: AltDetails | null;
  softDetails: SoftDetails | null;
  ingredients: RecipeIngredientView[];
  steps: RecipeStepView[];
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
  /** Toutes les versions d'une même famille (`familyId`) — parcours versions (M2-09). */
  familyId?: string;
}

/** Fichier d'export d'une recette (M2-12) : contenu brut + nom + type MIME. */
export interface RecipeExportFile {
  filename: string;
  content: string;
  contentType: string;
}

export const recipesApi = {
  list: (filters: RecipeListFilters = {}): Promise<RecipeSummary[]> => {
    const qs = new URLSearchParams();
    if (filters.engine) qs.set("engine", filters.engine);
    if (filters.status) qs.set("status", filters.status);
    if (filters.familyId) qs.set("familyId", filters.familyId);
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

  replaceIngredients: (id: string, ingredients: RecipeIngredientInput[]): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}/ingredients`, {
      method: "PUT",
      body: JSON.stringify({ ingredients }),
    }).then((r) => r.recipe),

  replaceSteps: (id: string, steps: RecipeStepInput[]): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}/steps`, {
      method: "PUT",
      body: JSON.stringify({ steps }),
    }).then((r) => r.recipe),

  // ── Cycle de vie (M2-03/ADR-07). Transitions serveur : DRAFT → PUBLISHED → ARCHIVED. ──

  /** Publie un brouillon. Rejette en 422 `NOT_PUBLISHABLE` (cf. `publicationErrors`). */
  publish: (id: string): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}/publish`, { method: "POST" }).then(
      (r) => r.recipe,
    ),

  /** Crée un brouillon version n+1 depuis une recette publiée (renvoie le nouveau DRAFT). */
  newVersion: (id: string): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}/new-version`, { method: "POST" }).then(
      (r) => r.recipe,
    ),

  /** Archive une recette publiée (PUBLISHED → ARCHIVED). */
  archive: (id: string): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>(`/api/recipes/${id}/archive`, { method: "POST" }).then(
      (r) => r.recipe,
    ),

  // ── Import / export (M2-12). BEER → BeerXML ; ALT/SOFT → JSON `brasso-recipe`. ──

  /** Télécharge le fichier d'export d'une recette (format selon le moteur). */
  exportRecipe: async (id: string): Promise<RecipeExportFile> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/recipes/${id}/export`, { credentials: "include" });
    } catch {
      throw new ApiError(0, "NETWORK", "Impossible de joindre le serveur");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiError(
        res.status,
        body?.error?.code ?? "ERROR",
        body?.error?.message ?? res.statusText,
        body?.error?.details,
      );
    }
    const content = await res.text();
    return {
      filename: filenameFromDisposition(res.headers.get("content-disposition")) ?? `recette-${id}`,
      content,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  },

  /** Importe un fichier (BeerXML ou JSON `brasso-recipe`) → nouveau DRAFT v1. */
  importRecipe: (content: string, format: "beerxml" | "json"): Promise<RecipeDetail> =>
    request<{ recipe: RecipeDetail }>("/api/recipes/import", {
      method: "POST",
      headers: { "content-type": format === "beerxml" ? "application/xml" : "application/json" },
      body: content,
    }).then((r) => r.recipe),
};

// ─────────────────────────────────────────────────────────────────────────────
// Référentiels éditeur (M2-04) — pickers lecture seule : styles BJCP + catalogue.
// ─────────────────────────────────────────────────────────────────────────────

/** Vue lecture d'un article de catalogue (miroir de `CatalogItemView` côté API). */
export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  category: IngredientCategory | null;
  unit: StockUnit;
  /** Attributs techniques (α, couleur EBC, potentiel, atténuation…) en JSONB. */
  attributes: unknown;
  defaultUnitCostCents: number | null;
  reorderThreshold: number | null;
}

export interface CatalogListParams {
  kind?: CatalogKind;
  category?: IngredientCategory;
  search?: string;
  limit?: number;
  offset?: number;
}

export const referentialsApi = {
  bjcpStyles: (search?: string): Promise<BjcpStyle[]> => {
    const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<{ styles: BjcpStyle[] }>(`/api/bjcp-styles${suffix}`).then((r) => r.styles);
  },

  catalogItems: (params: CatalogListParams = {}): Promise<CatalogItem[]> => {
    const qs = new URLSearchParams();
    if (params.kind) qs.set("kind", params.kind);
    if (params.category) qs.set("category", params.category);
    if (params.search) qs.set("search", params.search);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ items: CatalogItem[] }>(`/api/catalog-items${suffix}`).then((r) => r.items);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Profils d'équipement (M3-03 api / M3-07 web). Miroir de `EquipmentProfileView`
// côté API ; dates sérialisées ISO. Le corps de création réutilise le schéma Zod
// partagé `@brasso/core` (validation client alignée, ADR-04).
// ─────────────────────────────────────────────────────────────────────────────

/** Vue d'un profil d'équipement (miroir de `EquipmentProfileView`). */
export interface EquipmentProfile {
  id: string;
  name: string;
  nominalVolumeL: number;
  deadspaceL: number;
  transferLossL: number;
  evaporationRateLPerHour: number;
  grainAbsorptionLPerKg: number;
  heatingPowerKw: number | null;
  thermalMassKjPerC: number | null;
  waterProfiles: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Corps de création — forme du schéma partagé (`equipmentProfileSchema`). */
export type EquipmentCreateInput = EquipmentProfileInput;
/** Patch partiel + réactivation possible (`isActive`). */
export type EquipmentUpdateInput = Partial<EquipmentProfileInput> & { isActive?: boolean };

export interface EquipmentListFilters {
  /** `true` = actifs, `false` = inactifs, absent = tous. */
  active?: boolean;
}

export const equipmentApi = {
  list: (filters: EquipmentListFilters = {}): Promise<EquipmentProfile[]> => {
    const suffix = filters.active === undefined ? "" : `?active=${String(filters.active)}`;
    return request<{ profiles: EquipmentProfile[] }>(`/api/equipment-profiles${suffix}`).then(
      (r) => r.profiles,
    );
  },

  get: (id: string): Promise<EquipmentProfile> =>
    request<{ profile: EquipmentProfile }>(`/api/equipment-profiles/${id}`).then((r) => r.profile),

  create: (input: EquipmentCreateInput): Promise<EquipmentProfile> =>
    request<{ profile: EquipmentProfile }>("/api/equipment-profiles", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.profile),

  update: (id: string, input: EquipmentUpdateInput): Promise<EquipmentProfile> =>
    request<{ profile: EquipmentProfile }>(`/api/equipment-profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.profile),

  /** Désactive un profil (`isActive=false`) — préserve l'historique des batchs. */
  deactivate: (id: string): Promise<EquipmentProfile> =>
    request<{ profile: EquipmentProfile }>(`/api/equipment-profiles/${id}/deactivate`, {
      method: "POST",
    }).then((r) => r.profile),
};

// ─────────────────────────────────────────────────────────────────────────────
// Batchs (M3-04/05 api / M3-08 web). Miroir de `BatchDetailView` côté API ; dates
// sérialisées ISO. La planification fige un snapshot immuable + un numéro et
// réserve le stock des ingrédients catalogués (M3-05).
// ─────────────────────────────────────────────────────────────────────────────

export type BatchStatus =
  "PLANIFIE" | "EN_BRASSAGE" | "EN_FERMENTATION" | "EN_CONDITIONNEMENT" | "TERMINE" | "ANNULE";

export type ReservationStatus = "RESERVED" | "CONSUMED" | "RELEASED";

/** Réservation de stock d'un batch (miroir de `ReservationView`). */
export interface BatchReservation {
  id: string;
  catalogItemId: string;
  quantity: number;
  status: ReservationStatus;
}

/** Vue détaillée d'un batch (miroir de `BatchDetailView`). */
export interface BatchDetail {
  id: string;
  batchNumber: number;
  recipeId: string;
  recipeVersion: number;
  equipmentProfileId: string | null;
  status: BatchStatus;
  plannedAt: string | null;
  brewedAt: string | null;
  fermentedAt: string | null;
  packagedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recipeSnapshot: unknown;
  reservations: BatchReservation[];
}

/** Avertissement de stock insuffisant (indicatif, non bloquant — M3-05). */
export interface StockWarning {
  catalogItemId: string;
  name: string;
  requested: number;
  available: number;
}

/** Résultat de planification : le batch + le bilan de réservation. */
export interface BatchPlanResult {
  batch: BatchDetail;
  /** Ingrédients hors catalogue (saisis à la main) → non réservés. */
  unreservedIngredients: string[];
  /** Articles dont le stock disponible est inférieur au besoin (non bloquant). */
  stockWarnings: StockWarning[];
}

export interface BatchCreateInput {
  recipeId: string;
  equipmentProfileId?: string;
  /** Date planifiée (ISO) — optionnelle. */
  plannedAt?: string;
}

/** Nature d'une mesure relevée sur un batch (miroir de `MeasureType`, M3-06). */
export type MeasureType = "GRAVITY" | "TEMPERATURE" | "PH" | "VOLUME" | "OTHER";

/** Mesure append-only relevée sur un batch (miroir de `MeasureView`). */
export interface BatchMeasure {
  id: string;
  type: MeasureType;
  value: number;
  unit: string | null;
  phase: string | null;
  loggedById: string | null;
  loggedAt: string;
}

/** Corps d'ajout d'une mesure (`type`, `value`, `unit?`, `phase?`). */
export interface MeasureCreateInput {
  type: MeasureType;
  value: number;
  unit?: string;
  phase?: string;
}

export const batchesApi = {
  get: (id: string): Promise<BatchDetail> =>
    request<{ batch: BatchDetail }>(`/api/batches/${id}`).then((r) => r.batch),

  /** Planifie un batch depuis une recette publiée → renvoie le bilan de réservation. */
  plan: (input: BatchCreateInput): Promise<BatchPlanResult> =>
    request<BatchPlanResult>("/api/batches", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Mesures d'un batch, chronologiques (filtrables par type). */
  measures: (id: string, type?: MeasureType): Promise<BatchMeasure[]> => {
    const suffix = type ? `?type=${type}` : "";
    return request<{ measures: BatchMeasure[] }>(`/api/batches/${id}/measures${suffix}`).then(
      (r) => r.measures,
    );
  },

  /** Enregistre une mesure append-only sur un batch. */
  addMeasure: (id: string, input: MeasureCreateInput): Promise<BatchMeasure> =>
    request<{ measure: BatchMeasure }>(`/api/batches/${id}/measures`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.measure),

  /** Fait progresser le statut d'un batch (transitions M3-06). */
  changeStatus: (id: string, status: BatchStatus): Promise<BatchDetail> =>
    request<{ batch: BatchDetail }>(`/api/batches/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }).then((r) => r.batch),
};
