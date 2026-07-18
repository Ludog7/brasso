-- CreateEnum
CREATE TYPE "BatchMilestoneKind" AS ENUM ('FERMENTATION', 'DRY_HOP', 'COLD_CRASH', 'GARDE');

-- AlterEnum
ALTER TYPE "CatalogKind" ADD VALUE 'PRODUIT_FINI';

-- AlterEnum
-- `BEFORE 'REFROIDISSEMENT'` est explicite et volontaire : sans clause de
-- position, PostgreSQL ajoute la valeur en FIN d'énumération, ce qui ferait
-- diverger l'ordre physique (`enumsortorder`) de l'ordre déclaré dans
-- `schema.prisma` (… EBULLITION, WHIRLPOOL, REFROIDISSEMENT …). Aucun code ne
-- trie aujourd'hui sur `DayPhase` — la séquence des phases est portée par le
-- `DayPlan` de `core`, pas par SQL — mais un futur `ORDER BY phase` placerait
-- alors le whirlpool après l'ensemencement, en silence.
ALTER TYPE "DayPhase" ADD VALUE 'WHIRLPOOL' BEFORE 'REFROIDISSEMENT';

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "sourceBatchId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "coolingCircuitSanitizeLeadMin" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "defaultColdCrashDays" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "defaultConditioningDays" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "defaultDryHopDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "defaultFermentationDays" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "BatchMilestone" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" "BatchMilestoneKind" NOT NULL,
    "plannedDurationDays" INTEGER NOT NULL,
    "plannedStartAt" TIMESTAMP(3) NOT NULL,
    "plannedEndAt" TIMESTAMP(3) NOT NULL,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchPackaging" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "containerItemId" TEXT,
    "containerVolumeL" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "packagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packagedById" TEXT,
    "note" TEXT,

    CONSTRAINT "BatchPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchMilestone_batchId_idx" ON "BatchMilestone"("batchId");

-- CreateIndex
CREATE INDEX "BatchMilestone_plannedEndAt_idx" ON "BatchMilestone"("plannedEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "BatchMilestone_batchId_kind_key" ON "BatchMilestone"("batchId", "kind");

-- CreateIndex
CREATE INDEX "BatchPackaging_batchId_idx" ON "BatchPackaging"("batchId");

-- CreateIndex
CREATE INDEX "BatchPackaging_catalogItemId_idx" ON "BatchPackaging"("catalogItemId");

-- CreateIndex
CREATE INDEX "CatalogItem_sourceBatchId_idx" ON "CatalogItem"("sourceBatchId");

-- AddForeignKey
ALTER TABLE "BatchMilestone" ADD CONSTRAINT "BatchMilestone_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchPackaging" ADD CONSTRAINT "BatchPackaging_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchPackaging" ADD CONSTRAINT "BatchPackaging_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchPackaging" ADD CONSTRAINT "BatchPackaging_containerItemId_fkey" FOREIGN KEY ("containerItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchPackaging" ADD CONSTRAINT "BatchPackaging_packagedById_fkey" FOREIGN KEY ("packagedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
