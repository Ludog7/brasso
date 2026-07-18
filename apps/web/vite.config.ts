import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// Cible du proxy dev vers l'API Fastify (M0-05/06). En prod, Caddy sert le front
// et relaie /auth vers l'API sur la même origine → cookies same-site OK.
const apiTarget = process.env.VITE_API_PROXY ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Brasso — gestion microbrasserie",
        short_name: "Brasso",
        description: "Recettes, batchs, Jour J, stocks, membres — microbrasserie associative.",
        lang: "fr",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        background_color: "#0f1512",
        theme_color: "#0f1512",
        icons: [
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // Budget de poids tablette (M8-07). Après le code-splitting par route (App.tsx),
    // le plus gros chunk est l'entrée (vendor React + router + query + shell ≈ 252 kB
    // brut / ~81 kB gzip) ; les pages et le chunk de schémas partagé sont tirés à la
    // demande. On plafonne à 300 kB pour qu'une régression de poids (p. ex. un retour
    // à un bundle monolithique ~680 kB) redéclenche l'avertissement Vite.
    chunkSizeWarningLimit: 300,
  },
  server: {
    port: 5173,
    // Même origine côté navigateur → pas de CORS, cookie de session conservé.
    proxy: {
      "/auth": { target: apiTarget, changeOrigin: true },
      "/api": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    restoreMocks: true,
    css: false,
  },
});
