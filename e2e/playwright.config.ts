/**
 * Configuration Playwright du socle E2E (M8-05).
 *
 * - **Cible tablette** (chromium, 1024×768) — l'app est pensée atelier/tablette.
 * - **Base de test isolée** réinitialisée + seedée par `fixtures/global-setup.ts`.
 * - **App réelle** démarrée par `webServer` : API Fastify (tsx) + front Vite (proxy
 *   même origine → API), sur des ports **dédiés E2E** (pas de collision avec le dev).
 * - **CI durci** : retries, un seul worker (base partagée), artefacts (trace/vidéo/
 *   capture) conservés **à l'échec** pour le diagnostic.
 */

import { defineConfig, devices } from "@playwright/test";

import {
  API_PORT,
  BASE_URL,
  DATABASE_URL,
  SESSION_SECRET,
  WEB_PORT,
  WEBHOOK_SECRETS,
} from "./fixtures/env.js";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./fixtures/global-setup.ts",
  // Base de test partagée → exécution sérielle et déterministe.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium-tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
  ],

  // L'API et le front sont lancés pour les tests ; en local on réutilise un
  // serveur déjà démarré (ports dédiés E2E), en CI on démarre systématiquement.
  webServer: [
    {
      command: "pnpm --filter @brasso/api run dev:e2e",
      port: API_PORT,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        API_PORT: String(API_PORT),
        DATABASE_URL,
        SESSION_SECRET,
        // Secrets HMAC résolus par `provider.webhookSecretRef` (M8-06).
        SUMUP_WEBHOOK_SECRET: WEBHOOK_SECRETS.SUMUP,
        ZETTLE_WEBHOOK_SECRET: WEBHOOK_SECRETS.ZETTLE,
        HELLOASSO_WEBHOOK_SECRET: WEBHOOK_SECRETS.HELLOASSO,
      },
    },
    {
      command: `pnpm --filter @brasso/web exec vite --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        VITE_API_PROXY: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
