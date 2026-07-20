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
import { CatalogKind, ExternalProviderKind, Prisma, PrismaClient } from "@prisma/client";

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
    membershipPeriodDays: SETTINGS_SEED.membershipPeriodDays,
    defaultWaterProfile: { ...DEFAULT_WATER_PROFILE },
    brandColor: SETTINGS_SEED.brandColor,
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

/**
 * Fournisseurs externes : amorce **HelloAsso** (cotisations, M6-07) et les terminaux
 * de caisse **SumUp** / **Zettle** (ventes, M7-03) pour l'ingestion par webhook.
 * Upsert par la clé naturelle `(kind, label)`. Le secret de signature n'est **jamais**
 * en base : `webhookSecretRef` ne porte que le **nom** de la variable d'environnement (§6).
 */
async function seedProviders(): Promise<void> {
  const providers = [
    {
      kind: ExternalProviderKind.HELLOASSO,
      label: "HelloAsso",
      webhookSecretRef: "HELLOASSO_WEBHOOK_SECRET",
    },
    {
      kind: ExternalProviderKind.SUMUP,
      label: "SumUp",
      webhookSecretRef: "SUMUP_WEBHOOK_SECRET",
    },
    {
      kind: ExternalProviderKind.ZETTLE,
      label: "Zettle",
      webhookSecretRef: "ZETTLE_WEBHOOK_SECRET",
    },
  ] as const;
  for (const p of providers) {
    await prisma.externalProvider.upsert({
      where: { kind_label: { kind: p.kind, label: p.label } },
      create: {
        kind: p.kind,
        label: p.label,
        webhookSecretRef: p.webhookSecretRef,
        isActive: true,
      },
      update: { webhookSecretRef: p.webhookSecretRef, isActive: true },
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
 * Module d'affichage (M7-02) : une surface « Bar » + un écran `CARDS` de démo
 * pointant 2-3 produits conditionnés du catalogue (démo M7-13). Idempotent :
 * upsert par `name` (surface), par `id` déterministe (écran), par la clé unique
 * `(screenId, catalogItemId)` (items). Les mentions légales sont du **texte
 * libre** porté par l'écran (aucune formulation réglementaire codée en dur, ADR-01).
 */
async function seedDisplay(): Promise<void> {
  const surface = await prisma.displaySurface.upsert({
    where: { name: "Bar" },
    create: { id: "surface-bar", name: "Bar", description: "Comptoir de la brasserie" },
    update: { description: "Comptoir de la brasserie", isActive: true },
  });

  const screenId = "screen-bar-cartes";
  await prisma.displayScreen.upsert({
    where: { id: screenId },
    create: {
      id: screenId,
      surfaceId: surface.id,
      name: "Cartes du bar",
      template: "CARDS",
      legalMentions: "L'abus d'alcool est dangereux pour la santé. À consommer avec modération.",
    },
    update: {
      surfaceId: surface.id,
      name: "Cartes du bar",
      template: "CARDS",
      legalMentions: "L'abus d'alcool est dangereux pour la santé. À consommer avec modération.",
      isActive: true,
    },
  });

  const items = [
    {
      catalogItemId: "cat-pkg-bottle-33",
      isNew: true,
      isFavorite: false,
      isSpecial: false,
      sortOrder: 0,
      priceCents: 450,
    },
    {
      catalogItemId: "cat-pkg-bottle-75",
      isNew: false,
      isFavorite: true,
      isSpecial: false,
      sortOrder: 1,
      priceCents: 900,
    },
    {
      catalogItemId: "cat-pkg-keg-20",
      isNew: false,
      isFavorite: false,
      isSpecial: true,
      sortOrder: 2,
      priceCents: 12000,
    },
  ];
  for (const { catalogItemId, ...data } of items) {
    await prisma.displayScreenItem.upsert({
      where: { screenId_catalogItemId: { screenId, catalogItemId } },
      create: { screenId, catalogItemId, ...data },
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
  await seedProviders();
  await seedCatalog();
  await seedDisplay();
  const adminSeeded = await seedAdminUser();

  // Critère observable (DoD) : comptages sur les tables amorcées.
  const [settingsCount, roleCount, userCount, providerCount, surfaceCount, screenItemCount] =
    await Promise.all([
      prisma.settings.count(),
      prisma.role.count(),
      prisma.user.count(),
      prisma.externalProvider.count(),
      prisma.displaySurface.count(),
      prisma.displayScreenItem.count(),
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
  console.log(`   • Providers    : ${providerCount}`);
  console.log(`   • Affichage    : ${surfaceCount} surface(s), ${screenItemCount} produit(s)`);
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
