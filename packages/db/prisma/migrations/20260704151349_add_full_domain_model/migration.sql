-- CreateEnum
CREATE TYPE "RecipeEngine" AS ENUM ('BEER', 'ALT_FERMENTED', 'SOFT_DRINK');

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('MALT', 'SUGAR', 'HOP', 'YEAST', 'ADJUNCT');

-- CreateEnum
CREATE TYPE "IngredientUse" AS ENUM ('MASH', 'FIRST_WORT', 'BOIL', 'WHIRLPOOL', 'DRY_HOP', 'PRIMARY', 'SECONDARY', 'BOTTLING', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessStepType" AS ENUM ('MASH', 'MASH_STEP', 'SPARGE', 'BOIL', 'WHIRLPOOL', 'COOL', 'FERMENT', 'STABILIZE', 'CONDITION', 'PACKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "StabilizationMethod" AS ENUM ('PASTEURIZATION', 'THERMAL', 'COLD_CHAIN', 'FILTRATION_ACIDIFICATION', 'CHEMICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PLANIFIE', 'EN_BRASSAGE', 'EN_FERMENTATION', 'EN_CONDITIONNEMENT', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "MeasureType" AS ENUM ('GRAVITY', 'TEMPERATURE', 'PH', 'VOLUME', 'OTHER');

-- CreateEnum
CREATE TYPE "DayPhase" AS ENUM ('INITIALISATION', 'EMPATAGE', 'FILTRATION', 'EBULLITION', 'REFROIDISSEMENT', 'ENSEMENCEMENT', 'TERMINE');

-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('RECETTE', 'BULK', 'CONDITIONNEMENT');

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('GRAM', 'LITER', 'UNIT');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('PURCHASE', 'PRODUCTION', 'ADJUSTMENT', 'INVENTORY', 'SALE', 'LOSS', 'RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ExternalProviderKind" AS ENUM ('HELLOASSO', 'SUMUP', 'ZETTLE');

-- CreateEnum
CREATE TYPE "ExternalTransactionKind" AS ENUM ('SALE', 'MEMBERSHIP', 'DONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ExternalTransactionStatus" AS ENUM ('MAPPED', 'UNMAPPED', 'IGNORED');

-- CreateEnum
CREATE TYPE "IntegrationAlertType" AS ENUM ('UNMAPPED_TRANSACTION', 'WEBHOOK_FAILURE', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('A_JOUR', 'EN_RETARD');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('COMMUNICATION', 'PHOTOS', 'NOTIFICATIONS_LEGALES');

-- CreateEnum
CREATE TYPE "AssociativeRole" AS ENUM ('ADHERENT', 'BRASSEUR', 'CA', 'TRESORIER', 'REFERENT_RGPD');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "memberId" TEXT;

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "membership" "MembershipStatus" NOT NULL DEFAULT 'EN_RETARD',
    "roles" "AssociativeRole"[] DEFAULT ARRAY[]::"AssociativeRole"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberConsent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "memberId" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "engine" "RecipeEngine" NOT NULL,
    "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeBeerDetails" (
    "recipeId" TEXT NOT NULL,
    "styleBjcp" TEXT,
    "targetOg" DOUBLE PRECISION,
    "targetFg" DOUBLE PRECISION,
    "targetIbu" DOUBLE PRECISION,
    "targetEbc" DOUBLE PRECISION,
    "boilTimeMin" INTEGER,
    "efficiency" DOUBLE PRECISION,
    "batchVolumeL" DOUBLE PRECISION,

    CONSTRAINT "RecipeBeerDetails_pkey" PRIMARY KEY ("recipeId")
);

-- CreateTable
CREATE TABLE "RecipeAltDetails" (
    "recipeId" TEXT NOT NULL,
    "baseType" TEXT NOT NULL,
    "targetPh" DOUBLE PRECISION,
    "stabilizationMethod" "StabilizationMethod",
    "residualSugarRisk" BOOLEAN NOT NULL DEFAULT false,
    "batchVolumeL" DOUBLE PRECISION,

    CONSTRAINT "RecipeAltDetails_pkey" PRIMARY KEY ("recipeId")
);

-- CreateTable
CREATE TABLE "RecipeSoftDetails" (
    "recipeId" TEXT NOT NULL,
    "sugarConcentration" DOUBLE PRECISION,
    "targetPh" DOUBLE PRECISION,
    "storageMode" TEXT,
    "stabilizationMethod" "StabilizationMethod",
    "batchVolumeL" DOUBLE PRECISION,

    CONSTRAINT "RecipeSoftDetails_pkey" PRIMARY KEY ("recipeId")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "name" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL,
    "use" "IngredientUse",
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" "StockUnit" NOT NULL DEFAULT 'GRAM',
    "timeMinutes" INTEGER,
    "params" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeProcessStep" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "type" "ProcessStepType" NOT NULL,
    "name" TEXT,
    "params" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nominalVolumeL" DOUBLE PRECISION NOT NULL,
    "deadspaceL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferLossL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evaporationRateLPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grainAbsorptionLPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heatingPowerKw" DOUBLE PRECISION,
    "thermalMassKjPerC" DOUBLE PRECISION,
    "waterProfiles" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "batchNumber" SERIAL NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeVersion" INTEGER NOT NULL,
    "recipeSnapshot" JSONB NOT NULL,
    "equipmentProfileId" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'PLANIFIE',
    "plannedAt" TIMESTAMP(3),
    "brewedAt" TIMESTAMP(3),
    "fermentedAt" TIMESTAMP(3),
    "packagedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchBrewer" (
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchBrewer_pkey" PRIMARY KEY ("batchId","userId")
);

-- CreateTable
CREATE TABLE "BatchMeasure" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "MeasureType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "phase" TEXT,
    "loggedById" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviationLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchDayState" (
    "batchId" TEXT NOT NULL,
    "phase" "DayPhase" NOT NULL DEFAULT 'INITIALISATION',
    "state" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchDayState_pkey" PRIMARY KEY ("batchId")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "category" "IngredientCategory",
    "unit" "StockUnit" NOT NULL DEFAULT 'GRAM',
    "attributes" JSONB,
    "defaultUnitCostCents" INTEGER,
    "reorderThreshold" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "lotCode" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestBeforeAt" TIMESTAMP(3),
    "unitCostCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "stockLotId" TEXT,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "batchId" TEXT,
    "userId" TEXT,
    "externalTransactionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalProvider" (
    "id" TEXT NOT NULL,
    "kind" "ExternalProviderKind" NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB,
    "webhookSecretRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTransaction" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" "ExternalTransactionKind" NOT NULL DEFAULT 'OTHER',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paymentMethod" TEXT,
    "externalProductId" TEXT,
    "status" "ExternalTransactionStatus" NOT NULL DEFAULT 'UNMAPPED',
    "memberId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuMapping" (
    "id" TEXT NOT NULL,
    "internalSku" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "providerId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "externalCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationAlert" (
    "id" TEXT NOT NULL,
    "type" "IntegrationAlertType" NOT NULL,
    "status" "IntegrationAlertStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "providerId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_memberNumber_key" ON "Member"("memberNumber");

-- CreateIndex
CREATE INDEX "Member_lastName_idx" ON "Member"("lastName");

-- CreateIndex
CREATE INDEX "MemberConsent_memberId_type_idx" ON "MemberConsent"("memberId", "type");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_memberId_idx" ON "AuditLog"("memberId");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Recipe_engine_status_idx" ON "Recipe"("engine", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_familyId_version_key" ON "Recipe"("familyId", "version");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_catalogItemId_idx" ON "RecipeIngredient"("catalogItemId");

-- CreateIndex
CREATE INDEX "RecipeProcessStep_recipeId_idx" ON "RecipeProcessStep"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_batchNumber_key" ON "Batch"("batchNumber");

-- CreateIndex
CREATE INDEX "Batch_recipeId_idx" ON "Batch"("recipeId");

-- CreateIndex
CREATE INDEX "Batch_status_idx" ON "Batch"("status");

-- CreateIndex
CREATE INDEX "BatchBrewer_userId_idx" ON "BatchBrewer"("userId");

-- CreateIndex
CREATE INDEX "BatchMeasure_batchId_type_idx" ON "BatchMeasure"("batchId", "type");

-- CreateIndex
CREATE INDEX "DeviationLog_batchId_idx" ON "DeviationLog"("batchId");

-- CreateIndex
CREATE INDEX "CatalogItem_kind_idx" ON "CatalogItem"("kind");

-- CreateIndex
CREATE INDEX "CatalogItem_category_idx" ON "CatalogItem"("category");

-- CreateIndex
CREATE INDEX "StockLot_catalogItemId_idx" ON "StockLot"("catalogItemId");

-- CreateIndex
CREATE INDEX "StockMovement_catalogItemId_idx" ON "StockMovement"("catalogItemId");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockReservation_catalogItemId_idx" ON "StockReservation"("catalogItemId");

-- CreateIndex
CREATE INDEX "StockReservation_batchId_idx" ON "StockReservation"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProvider_kind_label_key" ON "ExternalProvider"("kind", "label");

-- CreateIndex
CREATE INDEX "ExternalTransaction_status_idx" ON "ExternalTransaction"("status");

-- CreateIndex
CREATE INDEX "ExternalTransaction_occurredAt_idx" ON "ExternalTransaction"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTransaction_providerId_externalId_key" ON "ExternalTransaction"("providerId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuMapping_internalSku_key" ON "SkuMapping"("internalSku");

-- CreateIndex
CREATE INDEX "SkuMapping_catalogItemId_idx" ON "SkuMapping"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuMapping_providerId_externalProductId_key" ON "SkuMapping"("providerId", "externalProductId");

-- CreateIndex
CREATE INDEX "IntegrationAlert_status_idx" ON "IntegrationAlert"("status");

-- CreateIndex
CREATE INDEX "IntegrationAlert_type_idx" ON "IntegrationAlert"("type");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberId_key" ON "User"("memberId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberConsent" ADD CONSTRAINT "MemberConsent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeBeerDetails" ADD CONSTRAINT "RecipeBeerDetails_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeAltDetails" ADD CONSTRAINT "RecipeAltDetails_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeSoftDetails" ADD CONSTRAINT "RecipeSoftDetails_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeProcessStep" ADD CONSTRAINT "RecipeProcessStep_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_equipmentProfileId_fkey" FOREIGN KEY ("equipmentProfileId") REFERENCES "EquipmentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchBrewer" ADD CONSTRAINT "BatchBrewer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchBrewer" ADD CONSTRAINT "BatchBrewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMeasure" ADD CONSTRAINT "BatchMeasure_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMeasure" ADD CONSTRAINT "BatchMeasure_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationLog" ADD CONSTRAINT "DeviationLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationLog" ADD CONSTRAINT "DeviationLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchDayState" ADD CONSTRAINT "BatchDayState_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_externalTransactionId_fkey" FOREIGN KEY ("externalTransactionId") REFERENCES "ExternalTransaction"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTransaction" ADD CONSTRAINT "ExternalTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuMapping" ADD CONSTRAINT "SkuMapping_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuMapping" ADD CONSTRAINT "SkuMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAlert" ADD CONSTRAINT "IntegrationAlert_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ExternalProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAlert" ADD CONSTRAINT "IntegrationAlert_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ExternalTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only : verrou physique contre UPDATE/DELETE sur les registres immuables
-- (StockMovement, ExternalTransaction, AuditLog). Les FK de ces tables sont en
-- NO ACTION (pas de SetNull/Cascade) → aucune action référentielle ne tente de
-- les muter ; on peut donc bloquer UPDATE et DELETE sans faux positifs.
-- ADR-09 (transactions read-only) + traçabilité RGPD. On ne supprime pas
-- l'historique : on anonymise (M6-08).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION brasso_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table %.% est append-only : % interdit', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_append_only"
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION brasso_append_only();

CREATE TRIGGER "ExternalTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "ExternalTransaction"
  FOR EACH ROW EXECUTE FUNCTION brasso_append_only();

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION brasso_append_only();
