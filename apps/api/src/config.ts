import { z } from "zod";

/**
 * Configuration d'environnement de l'API, validée au démarrage (fail-fast).
 * Le port suit la convention de l'infra Docker (M0-03) : `API_PORT`.
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET doit faire au moins 16 caractères"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Parse et valide les variables d'environnement. Lève une erreur explicite
 * listant les variables invalides/manquantes — l'API refuse de démarrer avec
 * une config incomplète (SPEC M0-05, sécurité §6 : secrets obligatoires).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }
  return parsed.data;
}
