-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('EXTEND_BOIL', 'ADD_SUGAR', 'DILUTE', 'OTHER');

-- AlterTable
ALTER TABLE "BatchDayState" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DeviationLog" ADD COLUMN     "forcedFromStatus" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "phase" "DayPhase";

-- CreateTable
CREATE TABLE "BatchCorrectionLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchCorrectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayEventLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultRevision" INTEGER NOT NULL,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "rejection" TEXT,

    CONSTRAINT "DayEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchCorrectionLog_batchId_idx" ON "BatchCorrectionLog"("batchId");

-- CreateIndex
CREATE INDEX "DayEventLog_batchId_idx" ON "DayEventLog"("batchId");

-- AddForeignKey
ALTER TABLE "BatchCorrectionLog" ADD CONSTRAINT "BatchCorrectionLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchCorrectionLog" ADD CONSTRAINT "BatchCorrectionLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayEventLog" ADD CONSTRAINT "DayEventLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
