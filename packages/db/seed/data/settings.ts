// Rôles RBAC & configuration d'instance (M1-02).
//
// Rôles : la matrice §3.5 est FIGÉE (admin, brasseur, caisse, rgpd) et déjà
// insérée par la migration `add_rbac_roles` (socle M0, ids stables). Le seed les
// `upsert` par `key` pour rester idempotent et garantir leur présence même sur
// une base amorcée hors migration — sans jamais créer de doublon.
//
// Settings : ligne unique (mono-tenant, ADR-01). Id déterministe pour un upsert
// idempotent. Aucune constante métier hardcodée ailleurs : nom d'asso, TVA,
// profil d'eau et fuseau vivent ici.

/** Rôle RBAC de référence (clé stable ↔ matrice de permissions dans le code). */
export interface SeedRole {
  id: string;
  key: string;
  label: string;
}

export const ROLES: readonly SeedRole[] = [
  { id: "role_admin", key: "admin", label: "Administrateur" },
  { id: "role_brasseur", key: "brasseur", label: "Brasseur" },
  { id: "role_caisse", key: "caisse", label: "Caisse" },
  { id: "role_rgpd", key: "rgpd", label: "Référent RGPD" },
];

/** Id de la ligne `Settings` unique (mono-tenant) — clé d'upsert idempotente. */
export const SETTINGS_SINGLETON_ID = "settings-singleton";

/**
 * Profil d'eau par défaut : concentrations ioniques en mg/L (ppm). Eau de
 * réseau « moyenne » servant de base neutre ; la forme détaillée sera fixée par
 * core en M1 (empâtage & eau). Valeurs indicatives, ajustables en `Settings`.
 */
export const DEFAULT_WATER_PROFILE = {
  calciumPpm: 50,
  magnesiumPpm: 5,
  sodiumPpm: 10,
  chloridePpm: 40,
  sulfatePpm: 50,
  bicarbonatePpm: 100,
} as const;

export const SETTINGS_SEED = {
  id: SETTINGS_SINGLETON_ID,
  assoName: "Brasso — Brasserie associative (dev)",
  /** TVA 20 % exprimée en ppm (200000 ppm) — entier, jamais de flottant. */
  tvaRatePpm: 200_000,
  timezone: "Europe/Paris",
} as const;
