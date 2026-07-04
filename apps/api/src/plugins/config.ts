import fp from "fastify-plugin";

import type { AppConfig } from "../config.js";
import { loadConfig } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export interface ConfigPluginOptions {
  /** Config injectée (tests) ; sinon chargée et validée depuis l'environnement. */
  config?: AppConfig;
}

/**
 * Décore l'instance Fastify avec la config validée, accessible via `app.config`
 * et `request.server.config` dans toutes les routes/plugins.
 */
export default fp<ConfigPluginOptions>(
  (app, opts, done) => {
    app.decorate("config", opts.config ?? loadConfig());
    done();
  },
  { name: "config" },
);
