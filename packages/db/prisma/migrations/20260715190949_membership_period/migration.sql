-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "lastContributionAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "membershipPeriodDays" INTEGER NOT NULL DEFAULT 365;
