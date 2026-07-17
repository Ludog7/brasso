/**
 * Résolution de l'environnement du socle E2E (M8-05). Centralise l'URL de la
 * **base de test isolée**, le secret de session et les ports/URLs des serveurs
 * pilotés par Playwright (`webServer`). Toutes les valeurs sont surchargeables
 * par variable d'environnement pour la CI comme pour le poste local.
 *
 * ⚠️ La base ciblée par `DATABASE_URL` est **réinitialisée** (`prisma migrate
 * reset`) à chaque exécution : viser une base jetable (`brasso_test` /
 * `brasso_e2e`), jamais la base de dev.
 */

/** Ports dédiés E2E (distincts du dev 3000/5173 → pas de collision ni de réutilisation accidentelle). */
export const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);

/** Origine servie au navigateur (front Vite, proxy → API sur la même origine). */
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

/** Base directe de l'API (webhooks : appels serveur-à-serveur, hors proxy web). */
export const API_BASE = process.env.E2E_API_BASE ?? `http://localhost:${API_PORT}`;

/**
 * Secrets HMAC des webhooks (M8-06). Résolus par l'API via `provider.webhookSecretRef`
 * (noms d'env `*_WEBHOOK_SECRET`, cf. seed de base) → **doivent être injectés à
 * l'API** (webServer) sous ces noms, et **partagés** avec le helper qui signe.
 */
export const WEBHOOK_SECRETS = {
  SUMUP: process.env.SUMUP_WEBHOOK_SECRET ?? "e2e-sumup-hmac-secret",
  ZETTLE: process.env.ZETTLE_WEBHOOK_SECRET ?? "e2e-zettle-hmac-secret",
  HELLOASSO: process.env.HELLOASSO_WEBHOOK_SECRET ?? "e2e-helloasso-hmac-secret",
} as const;

/**
 * URL de la base de test. Priorité : `E2E_DATABASE_URL` (poste local), puis
 * `DATABASE_URL` (service Postgres de la CI), puis un défaut CI raisonnable.
 */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://brasso:brasso@localhost:5432/brasso_test";

/** Secret de session de l'API en test (≥ 16 car. imposés par la config API). */
export const SESSION_SECRET =
  process.env.E2E_SESSION_SECRET ?? "e2e-session-secret-override-in-ci-0123456789";
