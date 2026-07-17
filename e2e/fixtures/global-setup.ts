/**
 * `globalSetup` Playwright (M8-05) — prépare la **base de test isolée** avant que
 * les serveurs (`webServer`) et les tests ne démarrent :
 *
 * 1. applique les migrations (`prisma migrate deploy`, idempotent, non destructif) ;
 * 2. **purge** déterministe toutes les tables applicatives (`TRUNCATE … RESTART
 *    IDENTITY CASCADE` → séquences remises à zéro, ex. `batchNumber`) ;
 * 3. rejoue le **seed de base** (settings, rôles RBAC, catalogue) ;
 * 4. amorce les données de parcours E2E (comptes par rôle, équipement, recette
 *    publiée, stock) via {@link seedE2E}.
 *
 * ⚠️ La base ciblée est **vidée** : viser une base jetable, jamais celle de dev.
 * Le choix `migrate deploy` + `TRUNCATE` (plutôt que `migrate reset`) reste
 * reproductible en CI **et** exécutable en local sans commande destructive Prisma.
 *
 * L'API lancée ensuite lit la **même** `DATABASE_URL` (injectée par la config
 * `webServer`), garantissant que les tests s'exécutent contre la base seedée.
 */

import { execSync } from "node:child_process";

import { DATABASE_URL } from "./env.js";

/** Exécute une commande workspace en propageant la `DATABASE_URL` de test. */
function run(command: string): void {
  execSync(command, { stdio: "inherit", env: { ...process.env, DATABASE_URL } });
}

export default async function globalSetup(): Promise<void> {
  // La base ciblée doit recevoir DATABASE_URL pour les sous-process Prisma comme
  // pour le client Prisma en cours de process.
  process.env.DATABASE_URL = DATABASE_URL;

  console.log("[e2e] Application des migrations (migrate deploy)…");
  run("pnpm --filter @brasso/db exec prisma migrate deploy");

  const { prisma } = await import("@brasso/db");

  console.log("[e2e] Purge déterministe des tables applicatives…");
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  console.log("[e2e] Seed de base (settings, rôles RBAC, catalogue)…");
  run("pnpm --filter @brasso/db exec tsx seed/seed.ts");

  console.log("[e2e] Amorçage des données de parcours (comptes, équipement, recette, stock)…");
  const { seedE2E } = await import("./seed-e2e.js");
  await seedE2E();

  await prisma.$disconnect();
  console.log("[e2e] Base de test prête.");
}
