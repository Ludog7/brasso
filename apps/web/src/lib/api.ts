/**
 * Client HTTP de l'API Brasso. En dev, les requêtes relatives passent par le
 * proxy Vite (même origine → cookie de session conservé) ; en prod, Caddy relaie
 * `/auth` vers l'API. `VITE_API_URL` permet de cibler une origine explicite.
 */
import type {
  AssociativeRole,
  BjcpStyle,
  CatalogKind,
  ConsentType,
  DayEvent,
  DayPhase,
  DayPlan,
  DayState,
  EquipmentProfileInput,
  IngredientCategory,
  IngredientUse,
  MembershipStatus,
  PreBoilCorrection,
  ProcessStepType,
  RecipeIngredientInput,
  RecipeStepInput,
  StepTiming,
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
// Stock (M5-03/04/06 api / M5-07 web). Gestion du catalogue : niveaux dérivés du
// registre append-only, alertes de seuil, mouvements manuels et inventaire.
// Montants en **centimes** (unités internes) ; l'UI saisit/affiche en euros (×100).
// ─────────────────────────────────────────────────────────────────────────────

/** Article de catalogue + agrégats de stock (miroir de `StockItemView` côté API). */
export interface StockItem {
  id: string;
  name: string;
  kind: CatalogKind;
  category: IngredientCategory | null;
  unit: StockUnit;
  attributes: unknown;
  defaultUnitCostCents: number | null;
  reorderThreshold: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Niveau courant dérivé du registre (somme des mouvements). */
  level: number;
  /** Réservations `RESERVED` en cours (pertinent pour RECETTE). */
  reservedOutstanding: number;
  /** Disponible : `level − réservé` (RECETTE) ou `level` (BULK/CONDITIONNEMENT). */
  available: number;
  /** Sous le seuil de réappro (différencié par `kind`). */
  below: boolean;
}

/** Alerte de réappro (miroir de `StockAlertView`) : un article sous son seuil. */
export interface StockAlert {
  id: string;
  name: string;
  kind: CatalogKind;
  level: number;
  available: number;
  reorderThreshold: number;
}

/** Motif d'un mouvement **manuel** (PRODUCTION/SALE exclus, réservés batch/caisse). */
export type ManualMovementReason =
  "PURCHASE" | "ADJUSTMENT" | "INVENTORY" | "LOSS" | "RETURN" | "OTHER";

/** Corps de création d'un article (montant en centimes). */
export interface StockItemCreateInput {
  name: string;
  kind: CatalogKind;
  category?: IngredientCategory;
  unit: StockUnit;
  defaultUnitCostCents?: number;
  reorderThreshold?: number;
  isActive?: boolean;
}

/** Patch partiel d'un article — `kind` **non modifiable** après création. */
export interface StockItemUpdateInput {
  name?: string;
  category?: IngredientCategory;
  unit?: StockUnit;
  defaultUnitCostCents?: number;
  reorderThreshold?: number;
  isActive?: boolean;
}

/** Corps d'un mouvement manuel (`delta` signé et non nul). */
export interface StockMovementInput {
  catalogItemId: string;
  delta: number;
  reason: ManualMovementReason;
  note?: string;
}

/** Ligne de comptage d'inventaire (quantité comptée ≥ 0). */
export interface InventoryCountInput {
  catalogItemId: string;
  countedQuantity: number;
  note?: string;
}

/** Résultat par ligne d'inventaire (miroir de `InventoryLineResult`). */
export interface InventoryLineResult {
  catalogItemId: string;
  previousLevel: number;
  countedQuantity: number;
  delta: number;
  movementId?: string;
}

export const stockApi = {
  /** Catalogue + niveaux, filtrable par `kind`. */
  items: (kind?: CatalogKind): Promise<StockItem[]> => {
    const suffix = kind ? `?kind=${kind}` : "";
    return request<{ items: StockItem[] }>(`/api/stock/items${suffix}`).then((r) => r.items);
  },

  /** Articles sous leur seuil (triés par criticité). */
  alerts: (): Promise<StockAlert[]> =>
    request<{ items: StockAlert[] }>("/api/stock/alerts").then((r) => r.items),

  createItem: (input: StockItemCreateInput): Promise<StockItem> =>
    request<{ item: StockItem }>("/api/stock/items", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.item),

  updateItem: (id: string, input: StockItemUpdateInput): Promise<StockItem> =>
    request<{ item: StockItem }>(`/api/stock/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.item),

  /** Enregistre un mouvement manuel → renvoie le mouvement + le nouveau niveau. */
  createMovement: (input: StockMovementInput): Promise<{ level: number }> =>
    request<{ level: number }>("/api/stock/movements", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Applique un inventaire (comptages) → un ajustement par écart. */
  applyInventory: (counts: InventoryCountInput[]): Promise<InventoryLineResult[]> =>
    request<{ lines: InventoryLineResult[] }>("/api/stock/inventory", {
      method: "POST",
      body: JSON.stringify({ counts }),
    }).then((r) => r.lines),
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

/**
 * Base de valorisation du coût (M5-06) : `planned` = sur les réservations (avant
 * ensemencement) ; `consumed` = sur les quantités réellement consommées au volume réel.
 */
export type CostBasis = "planned" | "consumed";

/**
 * Coût de revient **estimé** d'un batch (miroir de `BatchCostView`, M5-06). Montants
 * en **centimes entiers** (unité interne) ; base = coûts de référence catalogue.
 */
export interface BatchCost {
  ingredientsCents: number;
  conditioningCents: number;
  bulkCents: number;
  totalCents: number;
  /** Coût au litre ; `null` si le volume du batch est indisponible. */
  costPerLiterCents: number | null;
  /** Coût à l'unité conditionnée ; `null` si le nombre d'unités est inconnu. */
  costPerPackagedUnitCents: number | null;
  /** Nombre de lignes à coût inconnu (comptées 0) → total sous-estimé. */
  missingCostLines: number;
  basis: CostBasis;
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

  /** Coût de revient estimé du batch (M5-06) : total, coût au litre, répartition + base. */
  cost: (id: string): Promise<BatchCost> =>
    request<{ cost: BatchCost }>(`/api/batches/${id}/cost`).then((r) => r.cost),
};

// ─────────────────────────────────────────────────────────────────────────────
// Session Jour J (M4-04/05/06 api / M4-08+ web). Le serveur est source de vérité
// (ADR-08) : plan dérivé du snapshot, état sérialisable, timings dérivés à `now`.
// Types réutilisés de `@brasso/core` (mêmes structures que la state machine).
// ─────────────────────────────────────────────────────────────────────────────

/** Vue d'une session Jour J (miroir de `DaySessionView` côté API). */
export interface DaySession {
  batchStatus: BatchStatus;
  /** Phase courante côté persistance (Prisma `DayPhase`). */
  phase: DayPhase;
  revision: number;
  plan: DayPlan;
  state: DayState;
  /** Chronométrage de l'étape courante à l'instant serveur (ou `null` si terminé). */
  timings: StepTiming | null;
}

/** Type de mesure relevée pendant le brassage (miroir de `MeasurementKind` core). */
export type DayMeasurementKind = "density" | "volume" | "temperature" | "ph";

/**
 * Événement Jour J piloté depuis le dérouleur (M4-09/10/11/12). Le serveur horodate
 * `at` lui-même en ligne (ADR-08) : le client n'envoie que l'intention. `FORCE_STEP`
 * (mode manuel) exige `author` + `reason` (motif obligatoire) et trace un écart.
 */
export type DayEventRequest =
  | { type: "START_STEP" }
  | { type: "CONFIRM_STABILIZATION"; temperatureC?: number; source?: "manual" | "sensor" }
  | {
      type: "RECORD_MEASUREMENT";
      kind: DayMeasurementKind;
      value: number;
      source?: "manual" | "sensor";
    }
  | { type: "VALIDATE_STEP" }
  | { type: "FORCE_STEP"; author: string; reason: string };

/**
 * Entrée du **journal d'écart** d'un batch (M4-12), lecture seule — miroir de
 * `DeviationView` côté API. Trace d'un forçage : étape, phase, motif, auteur, date.
 */
export interface DeviationEntry {
  id: string;
  step: string;
  phase: DayPhase | null;
  reason: string;
  /** Nom de l'auteur du forçage (`null` si compte supprimé). */
  author: string | null;
  forcedFromStatus: string | null;
  /** Horodatage métier du forçage (ISO 8601). */
  occurredAt: string;
}

/** Mesures pré-ébullition envoyées à l'aperçu de correction (M4-07/13). */
export interface PreBoilMeasurementInput {
  measuredGravity: number;
  measuredVolumeL: number;
}

/** Type de correction densité (miroir de l'enum Prisma `CorrectionType`, M4-03). */
export type CorrectionType = "EXTEND_BOIL" | "ADD_SUGAR" | "DILUTE" | "OTHER";

/**
 * Décision de correction densité **journalisée** (M4-07) — miroir de
 * `CorrectionLogView` côté API : la trace append-only de la décision retenue.
 */
export interface CorrectionEntry {
  id: string;
  stepId: string;
  type: CorrectionType;
  /** Proposition retenue conservée telle quelle (chiffres OG/ABV…). */
  payload: unknown;
  authorId: string | null;
  /** Horodatage de journalisation (ISO 8601). */
  createdAt: string;
}

/** Corps de journalisation d'une décision de correction (M4-07). */
export interface CorrectionDecisionInput {
  stepId: string;
  type: CorrectionType;
  payload: Record<string, unknown>;
}

/** Sort d'un événement rejoué par `:sync` (M4-06) — miroir de `SyncEventResult` côté API. */
export interface DaySyncResult {
  clientEventId: string;
  outcome: "applied" | "skipped" | "rejected";
  rejection?: string;
}

/** Réponse de `:sync` : la session serveur à jour + le sort de chaque événement rejoué. */
export interface DaySyncResponse extends DaySession {
  results: DaySyncResult[];
}

export const dayApi = {
  /** Charge la session Jour J. Rejette en 404 `NOT_FOUND` s'il n'y en a pas encore. */
  get: (batchId: string): Promise<DaySession> =>
    request<{ day: DaySession }>(`/api/batches/${batchId}/day`).then((r) => r.day),

  /** Démarre le Jour J (idempotent) : initialise l'état et passe le batch EN_BRASSAGE. */
  start: (batchId: string): Promise<DaySession> =>
    request<{ day: DaySession }>(`/api/batches/${batchId}/day/start`, { method: "POST" }).then(
      (r) => r.day,
    ),

  /**
   * Applique un événement à la session (M4-05). Renvoie la session à jour ; un refus
   * de la machine remonte en `ApiError` 409 `DAY_EVENT_REJECTED` (état serveur inchangé).
   */
  postEvent: (batchId: string, event: DayEventRequest): Promise<DaySession> =>
    request<{ day: DaySession }>(`/api/batches/${batchId}/day/events`, {
      method: "POST",
      body: JSON.stringify(event),
    }).then((r) => r.day),

  /** Journal des écarts de procédure du batch (M4-12), du plus ancien au plus récent. */
  deviations: (batchId: string): Promise<DeviationEntry[]> =>
    request<{ deviations: DeviationEntry[] }>(`/api/batches/${batchId}/day/deviations`).then(
      (r) => r.deviations,
    ),

  /**
   * **Aperçu** des corrections densité pré-ébullition (M4-07) — aide à la décision
   * (ADR-11), sans écriture : le serveur reconstitue les cibles du modèle et renvoie
   * l'écart + les propositions chiffrées (OG/ABV projetés).
   */
  previewCorrections: (
    batchId: string,
    measurement: PreBoilMeasurementInput,
  ): Promise<PreBoilCorrection> =>
    request<{ preview: PreBoilCorrection }>(`/api/batches/${batchId}/day/corrections/preview`, {
      method: "POST",
      body: JSON.stringify(measurement),
    }).then((r) => r.preview),

  /** Journalise la décision de correction retenue (M4-07) — append-only, trace visible. */
  recordCorrection: (
    batchId: string,
    decision: CorrectionDecisionInput,
  ): Promise<CorrectionEntry> =>
    request<{ correction: CorrectionEntry }>(`/api/batches/${batchId}/day/corrections`, {
      method: "POST",
      body: JSON.stringify(decision),
    }).then((r) => r.correction),

  /**
   * Rejoue une **file d'événements offline** (M4-14) via `:sync` (M4-06) : rejeu
   * **ordonné + idempotent** (clé `clientEventId`). Renvoie la session serveur
   * (source de vérité) + le sort de chaque événement (`applied|skipped|rejected`).
   */
  sync: (
    batchId: string,
    events: { clientEventId: string; event: DayEvent }[],
  ): Promise<DaySyncResponse> =>
    request<{ day: DaySyncResponse }>(`/api/batches/${batchId}/day/events:sync`, {
      method: "POST",
      body: JSON.stringify({ events }),
    }).then((r) => r.day),
};

// ─────────────────────────────────────────────────────────────────────────────
// Membres & consentements (M6-04/05 api / M6-09 web). Miroir des vues API
// (`MemberView` / `ConsentsView`) : dates sérialisées ISO, statut de cotisation
// **dérivé** côté serveur. Accès réservé aux rôles `admin`/`rgpd` (matrice §3.5).
// Minimisation (§6) : `birthDate` optionnelle. `memberNumber` immuable (hors update).
// ─────────────────────────────────────────────────────────────────────────────

/** Vue d'un membre (miroir de `MemberView` côté API). */
export interface Member {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Date de naissance ISO — optionnelle (minimisation §6). */
  birthDate: string | null;
  /** Statut de cotisation **dérivé** (période × dernière cotisation). */
  membership: MembershipStatus;
  roles: AssociativeRole[];
  lastContributionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Corps de création d'un membre. `birthDate` en `YYYY-MM-DD` (coercée côté API). */
export interface MemberCreateInput {
  memberNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  roles?: AssociativeRole[];
}

/** Patch de rectification — `memberNumber` **immuable** (volontairement absent). */
export type MemberUpdateInput = Partial<Omit<MemberCreateInput, "memberNumber">>;

export interface MemberListFilters {
  search?: string;
  membership?: MembershipStatus;
}

/** Un événement de consentement historisé (miroir de `ConsentEventView`). */
export interface ConsentEvent {
  id: string;
  type: ConsentType;
  granted: boolean;
  createdAt: string;
}

/** État des consentements : courant résolu par type + historique (append-only). */
export interface ConsentState {
  current: Record<ConsentType, { granted: boolean; at: string } | null>;
  history: ConsentEvent[];
}

export const membersApi = {
  list: (filters: MemberListFilters = {}): Promise<Member[]> => {
    const qs = new URLSearchParams();
    if (filters.search) qs.set("search", filters.search);
    if (filters.membership) qs.set("membership", filters.membership);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ members: Member[] }>(`/api/members${suffix}`).then((r) => r.members);
  },

  get: (id: string): Promise<Member> =>
    request<{ member: Member }>(`/api/members/${id}`).then((r) => r.member),

  create: (input: MemberCreateInput): Promise<Member> =>
    request<{ member: Member }>("/api/members", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.member),

  update: (id: string, input: MemberUpdateInput): Promise<Member> =>
    request<{ member: Member }>(`/api/members/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then((r) => r.member),

  /** État courant + historique des consentements d'un membre. */
  consents: (id: string): Promise<ConsentState> =>
    request<ConsentState>(`/api/members/${id}/consents`),

  /** Ajoute un événement de consentement (octroi/retrait) — append-only. */
  setConsent: (id: string, input: { type: ConsentType; granted: boolean }): Promise<ConsentEvent> =>
    request<{ event: ConsentEvent }>(`/api/members/${id}/consents`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((r) => r.event),

  // ── RGPD (M6-06 api / M6-10 web) — réservé au rôle `rgpd`. ──

  /** Dossier RGPD complet (droit d'accès) — objet JSON opaque, destiné au téléchargement. */
  exportDossier: (id: string): Promise<Record<string, unknown>> =>
    request<Record<string, unknown>>(`/api/members/${id}/export`),

  /** Anonymise un membre (irréversible) — renvoie la fiche PII effacée. 409 si déjà fait. */
  anonymize: (id: string): Promise<Member> =>
    request<{ member: Member }>(`/api/members/${id}/anonymize`, { method: "POST" }).then(
      (r) => r.member,
    ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Journal d'audit (M6-03 api / M6-10 web). Lecture seule, réservée `admin`/`rgpd`
// (matrice §3.5). Dates ISO. `metadata` opaque (contenu selon l'action).
// ─────────────────────────────────────────────────────────────────────────────

/** Entrée d'audit (miroir de `AuditEntryView` côté API). */
export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  memberId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditListFilters {
  memberId?: string;
  resourceType?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface AuditListResult {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export const auditApi = {
  list: (filters: AuditListFilters = {}): Promise<AuditListResult> => {
    const qs = new URLSearchParams();
    if (filters.memberId) qs.set("memberId", filters.memberId);
    if (filters.resourceType) qs.set("resourceType", filters.resourceType);
    if (filters.action) qs.set("action", filters.action);
    if (filters.limit != null) qs.set("limit", String(filters.limit));
    if (filters.offset != null) qs.set("offset", String(filters.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<AuditListResult>(`/api/audit${suffix}`);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Cotisations / rapprochement (M6-08 api / M6-10 web). Transaction externe
// read-only (ADR-09) : payload brut jamais renvoyé → l'UI dispose du montant, de
// la date et de la référence native (`externalId`), pas de l'email du payeur.
// ─────────────────────────────────────────────────────────────────────────────

/** Transaction externe (miroir de `TransactionView` — sous-ensemble exploité ici). */
export interface Contribution {
  id: string;
  externalId: string;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  status: "MAPPED" | "UNMAPPED" | "IGNORED";
  memberId: string | null;
  occurredAt: string;
}

export const contributionsApi = {
  /** Cotisations `MEMBERSHIP` en attente de rapprochement (`UNMAPPED`), récentes d'abord. */
  pending: (): Promise<Contribution[]> =>
    request<{ transactions: Contribution[] }>(
      "/api/transactions?status=UNMAPPED&kind=MEMBERSHIP",
    ).then((r) => r.transactions),

  /** Rapproche une cotisation à un membre → membre `A_JOUR` (dérivé côté API). */
  reconcile: (id: string, memberId: string): Promise<Contribution> =>
    request<{ transaction: Contribution }>(`/api/transactions/${id}/reconcile`, {
      method: "POST",
      body: JSON.stringify({ memberId }),
    }).then((r) => r.transaction),
};
