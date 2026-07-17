/**
 * Amorçage **spécifique E2E** (M8-05) — complète le seed de base (settings, rôles,
 * catalogue) rejoué par `prisma migrate reset` avec les données de parcours :
 *
 * - un **compte par rôle** (admin / brasseur / caisse) avec hash Argon2id
 *   vérifiable au login (mêmes paramètres que l'API) ;
 * - un **profil d'équipement** actif ;
 * - une **recette BEER publiée** (aucune règle de publication `core` sur BEER)
 *   avec un ingrédient catalogué (→ réservation de stock) et des étapes qui
 *   produisent un plan Jour J court : empâtage → ébullition → fermentation ;
 * - un **mouvement de stock** d'appro pour couvrir la réservation (pas d'alerte) ;
 * - (M8-06, hub caisse) un **article conditionné** + stock + **mapping SKU** SumUp ;
 * - (M8-06, adhésion) un **membre** `EN_RETARD` rapprochable par email HelloAsso.
 *
 * Idempotent : upserts sur clés stables ; la recette est recréée à l'identique.
 */

import { prisma } from "@brasso/db";
import { hash } from "@node-rs/argon2";

import {
  type Account,
  ACCOUNTS,
  CONDITIONED_INITIAL_STOCK,
  CONDITIONED_ITEM_ID,
  CONDITIONED_ITEM_NAME,
  EQUIPMENT_ID,
  MALT_CATALOG_ID,
  MAPPED_SKU,
  MEMBER_EMAIL,
  MEMBER_FIRST_NAME,
  MEMBER_LAST_NAME,
  MEMBER_NUMBER,
  RECIPE_FAMILY_ID,
  RECIPE_ID,
} from "./accounts.js";

/**
 * Paramètres Argon2id **identiques** à l'API (`apps/api/src/modules/auth/service.ts`)
 * et au seed de base : le hash produit ici doit être vérifiable au login.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Crée (ou met à jour) le compte de test et l'affecte à son rôle RBAC. */
async function seedAccount(account: Account): Promise<void> {
  const passwordHash = await hash(account.password, ARGON2_OPTIONS);
  const user = await prisma.user.upsert({
    where: { email: account.email },
    create: {
      email: account.email,
      displayName: account.displayName,
      passwordHash,
      isActive: true,
    },
    update: { displayName: account.displayName, passwordHash, isActive: true },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: account.roleKey } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
}

/** Profil d'équipement actif nécessaire à la planification d'un batch. */
async function seedEquipment(): Promise<void> {
  const data = {
    name: "Cuve E2E 20 L",
    nominalVolumeL: 20,
    deadspaceL: 1,
    transferLossL: 0.5,
    evaporationRateLPerHour: 3,
    grainAbsorptionLPerKg: 0.9,
    heatingPowerKw: 3,
    thermalMassKjPerC: 20,
    isActive: true,
  };
  await prisma.equipmentProfile.upsert({
    where: { id: EQUIPMENT_ID },
    create: { id: EQUIPMENT_ID, ...data },
    update: data,
  });
}

/**
 * Recette BEER **publiée** de parcours. BEER n'a aucune règle de publication
 * `core` (cf. `engines/publication.ts`) : on peut créer directement l'état
 * `PUBLISHED`. Recréée à l'identique (delete + create) pour rester déterministe.
 */
async function seedPublishedRecipe(): Promise<void> {
  await prisma.recipe.deleteMany({ where: { familyId: RECIPE_FAMILY_ID } });
  await prisma.recipe.create({
    data: {
      id: RECIPE_ID,
      familyId: RECIPE_FAMILY_ID,
      version: 1,
      name: "Blonde de test (E2E)",
      engine: "BEER",
      status: "PUBLISHED",
      notes: "Recette d'intégration — parcours brassage E2E.",
      beerDetails: {
        create: {
          styleBjcp: "21A",
          targetOg: 1.05,
          targetFg: 1.01,
          targetIbu: 30,
          targetEbc: 12,
          boilTimeMin: 60,
          efficiency: 0.72,
          batchVolumeL: 20,
        },
      },
      ingredients: {
        create: [
          {
            catalogItemId: MALT_CATALOG_ID,
            name: "Malt Pilsner",
            category: "MALT",
            amount: 4000,
            unit: "GRAM",
            sortOrder: 0,
            params: { colorEbc: 3.5, potentialSg: 1.037, isMashable: true },
          },
          {
            name: "Houblon Saaz (hors catalogue)",
            category: "HOP",
            use: "BOIL",
            amount: 40,
            unit: "GRAM",
            timeMinutes: 60,
            sortOrder: 1,
            params: { alphaFraction: 0.035, form: "pellet" },
          },
          {
            name: "Levure US-05",
            category: "YEAST",
            use: "PRIMARY",
            amount: 11.5,
            unit: "GRAM",
            sortOrder: 2,
            params: {},
          },
        ],
      },
      steps: {
        // MASH sans `timeMin` → pas de timer de palier (stabilisation puis validation
        // directe). BOIL exige `timeMin` mais le parcours s'arrête avant de l'armer.
        create: [
          { type: "MASH", name: "Empâtage mono-palier", params: { tempC: 67 }, sortOrder: 0 },
          { type: "BOIL", name: "Ébullition", params: { timeMin: 60 }, sortOrder: 1 },
          {
            type: "FERMENT",
            name: "Fermentation primaire",
            params: { tempC: 20, days: 14 },
            sortOrder: 2,
          },
        ],
      },
    },
  });
}

/**
 * Mouvement d'appro (append-only) couvrant la réservation du malt : la dispo
 * (`somme des deltas − réservé`) reste positive → aucune alerte de stock bas.
 */
async function seedStock(): Promise<void> {
  await prisma.stockMovement.create({
    data: { catalogItemId: MALT_CATALOG_ID, delta: 50_000, reason: "PURCHASE", note: "Appro E2E" },
  });
}

/**
 * Hub caisse (M8-06) : article conditionné vendu au comptoir + **mapping SKU**
 * (SumUp `externalProductId` → article) + stock initial. Une vente **mappée**
 * décrémente cet article ; une vente sur un SKU **absent** de ce mapping devient
 * une anomalie.
 */
async function seedHubCaisse(): Promise<void> {
  await prisma.catalogItem.upsert({
    where: { id: CONDITIONED_ITEM_ID },
    create: {
      id: CONDITIONED_ITEM_ID,
      name: CONDITIONED_ITEM_NAME,
      kind: "CONDITIONNEMENT",
      unit: "UNIT",
      defaultUnitCostCents: 150,
      isActive: true,
    },
    update: { name: CONDITIONED_ITEM_NAME, isActive: true },
  });
  await prisma.stockMovement.create({
    data: {
      catalogItemId: CONDITIONED_ITEM_ID,
      delta: CONDITIONED_INITIAL_STOCK,
      reason: "PURCHASE",
      note: "Appro conditionné E2E",
    },
  });

  const sumup = await prisma.externalProvider.findFirstOrThrow({ where: { kind: "SUMUP" } });
  await prisma.skuMapping.upsert({
    where: {
      providerId_externalProductId: { providerId: sumup.id, externalProductId: MAPPED_SKU },
    },
    create: {
      internalSku: "E2E-BLONDE-33",
      providerId: sumup.id,
      externalProductId: MAPPED_SKU,
      catalogItemId: CONDITIONED_ITEM_ID,
    },
    update: { catalogItemId: CONDITIONED_ITEM_ID },
  });
}

/**
 * Cycle adhésion (M8-06) : un membre **sans cotisation** (statut initial
 * `EN_RETARD`), rapproché par **email** de la cotisation HelloAsso → `A_JOUR`.
 */
async function seedMember(): Promise<void> {
  await prisma.member.upsert({
    where: { memberNumber: MEMBER_NUMBER },
    create: {
      memberNumber: MEMBER_NUMBER,
      firstName: MEMBER_FIRST_NAME,
      lastName: MEMBER_LAST_NAME,
      email: MEMBER_EMAIL,
      membership: "EN_RETARD",
    },
    update: {
      firstName: MEMBER_FIRST_NAME,
      lastName: MEMBER_LAST_NAME,
      email: MEMBER_EMAIL,
      membership: "EN_RETARD",
      lastContributionAt: null,
    },
  });
}

/** Point d'entrée : amorce l'ensemble des données de parcours E2E. */
export async function seedE2E(): Promise<void> {
  for (const account of Object.values(ACCOUNTS)) {
    await seedAccount(account);
  }
  await seedEquipment();
  await seedPublishedRecipe();
  await seedStock();
  await seedHubCaisse();
  await seedMember();
}
