import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

/**
 * Bootstrap du serveur : charge la config (fail-fast), construit l'app, écoute
 * et gère l'arrêt gracieux (SIGINT/SIGTERM — arrêt propre en conteneur).
 */
export async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  const shutdown = (signal: string): void => {
    app.log.info({ signal }, "Arrêt du serveur…");
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, "Échec de l'arrêt");
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
