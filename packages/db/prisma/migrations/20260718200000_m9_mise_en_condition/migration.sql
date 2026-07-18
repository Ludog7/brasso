-- M9-15 — mise en condition avant vente : refermentation en bouteille (~3 semaines)
-- et carbonatation forcée en fût (~1 semaine après un relevé de pression conforme).
-- Une bière tout juste conditionnée est plate : elle n'est pas vendable en l'état.

-- CreateEnum
CREATE TYPE "ConditioningMethod" AS ENUM ('NONE', 'REFERMENTATION', 'FORCED_CARBONATION');

-- AlterTable
-- Les délais et la tolérance sont des **paramètres métier** (ADR-01), lus ici
-- puis fournis en entrée au calcul — jamais des constantes de `core`.
-- La tolérance est en millibar entier : « pas de flottant pour un paramètre de
-- réglage », un 0,2 bar stocké en Float redevenant 0,19999999999999998.
ALTER TABLE "Settings" ADD COLUMN     "carbonationToleranceMbar" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "forcedCarbonationDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "refermentationDays" INTEGER NOT NULL DEFAULT 21;

-- AlterTable
-- La mise en condition est portée par la **ligne** de conditionnement, pas par
-- le brassin : un même brassin part souvent moitié en fûts, moitié en
-- bouteilles, et les deux ne sont pas prêts à la vente en même temps.
-- Les conditionnements déjà enregistrés prennent `NONE` et gardent une date de
-- mise en vente nulle : on ne rétro-déclare pas une carbonatation qui n'a pas
-- été constatée.
ALTER TABLE "BatchPackaging" ADD COLUMN     "availableForSaleAt" TIMESTAMP(3),
ADD COLUMN     "carbonationValidatedAt" TIMESTAMP(3),
ADD COLUMN     "co2TargetVolumes" DOUBLE PRECISION,
ADD COLUMN     "conditioningMethod" "ConditioningMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "measuredPressureBar" DOUBLE PRECISION,
ADD COLUMN     "measuredTempC" DOUBLE PRECISION;

-- CreateIndex
-- Sert la question « qu'est-ce qui est vendable aujourd'hui ? » — posée par la
-- carte du bar (M11) et le tableau de bord.
CREATE INDEX "BatchPackaging_availableForSaleAt_idx" ON "BatchPackaging"("availableForSaleAt");
