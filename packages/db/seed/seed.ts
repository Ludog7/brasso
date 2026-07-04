// Seed Brasso (M1-02) — peuple une base fraîche avec le socle métier minimal :
// settings d'instance, rôles RBAC, catalogue d'ingrédients/articles, et un compte
// admin de développement (depuis l'environnement).
//
// Idempotent : tout passe par `upsert` sur une clé naturelle/déterministe →
// réexécutable sans doublon (`prisma migrate reset` le rejoue via `prisma.seed`).
//
// Exécution : `pnpm --filter @brasso/db db:seed` (charge le `.env` racine).
// Styles BJCP : données de référence STATIQUES (voir data/bjcp-styles.ts), pas
// une table — comptées ici pour l'observabilité.

import { hash } from "@node-rs/argon2";
import { CatalogKind, Prisma, PrismaClient } from "@prisma/client";

import { BJCP_STYLES } from "./data/bjcp-styles.js";
import { CATALOG_ITEMS } from "./data/catalog.js";
import { DEFAULT_WATER_PROFILE, ROLES, SETTINGS_SEED } from "./data/settings.js";

/**
 * Paramètres Argon2id identiques à l'API (apps/api/src/modules/auth/service.ts) :
 * le hash produit ici doit être vérifiable au login. Toute divergence casserait
 * l'authentification du compte admin seedé.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const prisma = new PrismaClient();

/** Configuration d'instance : ligne unique (mono-tenant, ADR-01). */
async function seedSettings(): Promise<void> {
  const data = {
    assoName: SETTINGS_SEED.assoName,
    tvaRatePpm: SETTINGS_SEED.tvaRatePpm,
    timezone: SETTINGS_SEED.timezone,
    defaultWaterProfile: { ...DEFAULT_WATER_PROFILE },
  };
  await prisma.settings.upsert({
    where: { id: SETTINGS_SEED.id },
    create: { id: SETTINGS_SEED.id, ...data },
    update: data,
  });
}

/** Rôles RBAC figés (matrice §3.5). Upsert par `key` → jamais de doublon. */
async function seedRoles(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      create: { id: role.id, key: role.key, label: role.label },
      update: { label: role.label },
    });
  }
}

/** Catalogue d'articles. Upsert par `id` déterministe (name non unique). */
async function seedCatalog(): Promise<void> {
  for (const item of CATALOG_ITEMS) {
    const data = {
      name: item.name,
      kind: item.kind,
      category: item.category,
      unit: item.unit,
      // `attributes` NULL en base quand l'article n'en porte pas (Prisma.DbNull,
      // pas le `null` TS que le champ JSON refuse).
      attributes: item.attributes ?? Prisma.DbNull,
      defaultUnitCostCents: item.defaultUnitCostCents,
      reorderThreshold: item.reorderThreshold,
      isActive: true,
    };
    await prisma.catalogItem.upsert({
      where: { id: item.id },
      create: { id: item.id, ...data },
      update: data,
    });
  }
}

/**
 * Compte admin de développement, amorcé depuis l'environnement (jamais de mot de
 * passe hardcodé). Absent des variables → étape ignorée. Rejoue proprement :
 * upsert par email + affectation du rôle admin.
 */
async function seedAdminUser(): Promise<boolean> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const displayName = process.env.SEED_ADMIN_NAME?.trim() || "Admin Dev";

  if (!email || !password) {
    console.warn(
      "   ⚠ Compte admin ignoré — définir SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD pour l'amorcer.",
    );
    return false;
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, displayName, passwordHash, isActive: true },
    update: { displayName, passwordHash, isActive: true },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    create: { userId: user.id, roleId: adminRole.id },
    update: {},
  });

  return true;
}

async function main(): Promise<void> {
  console.log("🌱 Seed Brasso — démarrage");

  await seedSettings();
  await seedRoles();
  await seedCatalog();
  const adminSeeded = await seedAdminUser();

  // Critère observable (DoD) : comptages sur les tables amorcées.
  const [settingsCount, roleCount, userCount] = await Promise.all([
    prisma.settings.count(),
    prisma.role.count(),
    prisma.user.count(),
  ]);
  const catalogByKind = await prisma.catalogItem.groupBy({
    by: ["kind"],
    _count: { _all: true },
  });

  console.log("✅ Seed terminé :");
  console.log(`   • Settings     : ${settingsCount}`);
  console.log(`   • Rôles RBAC   : ${roleCount}`);
  for (const kind of [CatalogKind.RECETTE, CatalogKind.BULK, CatalogKind.CONDITIONNEMENT]) {
    const row = catalogByKind.find((r) => r.kind === kind);
    console.log(`   • Catalogue ${kind.padEnd(14)}: ${row?._count._all ?? 0}`);
  }
  console.log(`   • Styles BJCP  : ${BJCP_STYLES.length} (référence statique)`);
  console.log(`   • Utilisateurs : ${userCount}${adminSeeded ? " (admin dev inclus)" : ""}`);
}

main()
  .catch((err: unknown) => {
    console.error("❌ Seed échoué :", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
