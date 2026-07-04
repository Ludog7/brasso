-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "assoName" TEXT NOT NULL,
    "tvaRatePpm" INTEGER NOT NULL DEFAULT 0,
    "defaultWaterProfile" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
