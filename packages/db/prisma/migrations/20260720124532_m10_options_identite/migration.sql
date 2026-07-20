-- Migration **additive** (M10-04). Aucune colonne supprimée, aucune migration
-- mergée modifiée.
--
-- NOTE : `prisma migrate dev` a proposé ici un `DROP INDEX
-- "BatchPackaging_availableForSaleAt_idx"`. Il a été **retiré volontairement**.
-- Cet index est créé par la migration M9 `20260718200000_m9_mise_en_condition`
-- mais n'est pas déclaré dans `schema.prisma` : c'est une **divergence
-- préexistante**, hors du périmètre de ce ticket, tracée par son propre ticket
-- `type:bug`. Le supprimer ici aurait fait disparaître en silence un index
-- destiné à la carte du bar (M11) et au tableau de bord.

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'PIN');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "authMethod" "AuthMethod" NOT NULL DEFAULT 'PASSWORD';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "defaultDisplayTemplate" "DisplayTemplate" NOT NULL DEFAULT 'CARDS',
ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "weatherEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weatherLatitudeMicroDeg" INTEGER,
ADD COLUMN     "weatherLongitudeMicroDeg" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinFirstFailedAt" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "pinRenewalRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinUpdatedAt" TIMESTAMP(3);

-- Bornes des coordonnées de l'instance (M10-04, §9.2 Q6). Prisma ne sait pas
-- exprimer une contrainte `CHECK` dans le schéma : elle est posée ici, en base,
-- parce qu'une latitude hors de ±90° n'est pas une préférence discutable, c'est
-- une donnée fausse. La validation applicative (Zod, M10-05) s'ajoute à cette
-- garantie, elle ne la remplace pas — une écriture directe en SQL doit échouer
-- elle aussi.
-- Unité : micro-degrés entiers (degré × 1 000 000).
ALTER TABLE "Settings"
  ADD CONSTRAINT "Settings_weatherLatitudeMicroDeg_range"
  CHECK ("weatherLatitudeMicroDeg" IS NULL
         OR ("weatherLatitudeMicroDeg" BETWEEN -90000000 AND 90000000));

ALTER TABLE "Settings"
  ADD CONSTRAINT "Settings_weatherLongitudeMicroDeg_range"
  CHECK ("weatherLongitudeMicroDeg" IS NULL
         OR ("weatherLongitudeMicroDeg" BETWEEN -180000000 AND 180000000));
