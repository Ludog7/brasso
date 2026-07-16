-- CreateEnum
CREATE TYPE "DisplayTemplate" AS ENUM ('LIST', 'TABLE', 'CARDS');

-- CreateTable
CREATE TABLE "DisplaySurface" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplaySurface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayScreen" (
    "id" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" "DisplayTemplate" NOT NULL DEFAULT 'CARDS',
    "legalMentions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayScreen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisplayScreenItem" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisplayScreenItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisplaySurface_name_key" ON "DisplaySurface"("name");

-- CreateIndex
CREATE INDEX "DisplayScreen_surfaceId_idx" ON "DisplayScreen"("surfaceId");

-- CreateIndex
CREATE INDEX "DisplayScreenItem_screenId_idx" ON "DisplayScreenItem"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "DisplayScreenItem_screenId_catalogItemId_key" ON "DisplayScreenItem"("screenId", "catalogItemId");

-- AddForeignKey
ALTER TABLE "DisplayScreen" ADD CONSTRAINT "DisplayScreen_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "DisplaySurface"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayScreenItem" ADD CONSTRAINT "DisplayScreenItem_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "DisplayScreen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisplayScreenItem" ADD CONSTRAINT "DisplayScreenItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
