/**
 * Conditionnement d'un brassin (M9-08) : lignes `BatchPackaging`, article
 * **produit fini** (`CatalogKind.PRODUIT_FINI`) et mouvements de stock associés.
 *
 * Choix acté (SPEC-ORCHESTRATION §9.2, Q10) : un produit fini est un
 * `CatalogItem` du module Stock existant, **pas** un store dédié — parce que
 * `SkuMapping.catalogItemId` et `DisplayScreenItem.catalogItemId` pointent déjà
 * sur `CatalogItem`. C'est ce qui rend une bière conditionnée vendable et
 * affichable **sans une ligne nouvelle** dans le pipeline M7.
 *
 * L'unité de stock est le **brassin**, pas la recette : deux brassins d'une même
 * recette donnent deux articles distincts, sans quoi la traçabilité de lot
 * (rappel, DLU, écart qualité) serait perdue. Le regroupement d'affichage par
 * recette relève de l'UI (M11).
 *
 * Registre **append-only** : une erreur se corrige par un mouvement inverse
 * (`ADJUSTMENT`), jamais par UPDATE ni DELETE.
 */

import type { PrismaClient } from "@brasso/db";

/** Mise en condition d'une ligne (miroir de l'enum Prisma `ConditioningMethod`). */
export type ConditioningMethod = "NONE" | "REFERMENTATION" | "FORCED_CARBONATION";

/** Ligne de conditionnement saisie par l'opérateur. */
export interface PackagingLineInput {
  /** Article `CONDITIONNEMENT` consommé (bouteille, fût…) ; `null` si non suivi. */
  containerItemId: string | null;
  /** Volume **réellement rempli** par contenant (L). */
  containerVolumeL: number;
  quantity: number;
  /** Mise en condition avant vente (M9-15). */
  conditioningMethod: ConditioningMethod;
  /** CO₂ visé (volumes) — carbonatation forcée uniquement. */
  co2TargetVolumes: number | null;
  /** Date estimée de mise en vente, déjà calculée par `core`. */
  availableForSaleAt: Date | null;
}

/** Relevé de carbonatation à enregistrer sur une ligne (M9-15). */
export interface CarbonationReadingData {
  measuredPressureBar: number;
  measuredTempC: number;
  /** Instant du relevé jugé atteignant la cible ; `null` s'il ne l'atteint pas. */
  carbonationValidatedAt: Date | null;
  /** Date de mise en vente, calculée par `core` ; `null` tant que la cible n'est pas atteinte. */
  availableForSaleAt: Date | null;
}

/** Données d'un conditionnement à enregistrer (le service a validé). */
export interface PackagingRecordData {
  lines: PackagingLineInput[];
  /** Volume conditionné total constaté (L) — enregistré comme mesure `VOLUME`. */
  packagedVolumeL: number;
  /** Nom de l'article produit fini à créer si le brassin n'en a pas encore. */
  productName: string;
  note: string | null;
}

/** Ligne de conditionnement persistée. */
export interface PackagingLineView {
  id: string;
  catalogItemId: string;
  containerItemId: string | null;
  containerVolumeL: number;
  quantity: number;
  conditioningMethod: ConditioningMethod;
  co2TargetVolumes: number | null;
  measuredPressureBar: number | null;
  measuredTempC: number | null;
  carbonationValidatedAt: Date | null;
  availableForSaleAt: Date | null;
  packagedAt: Date;
  note: string | null;
}

/** Mouvement de stock généré par un conditionnement. */
export interface PackagingMovementView {
  id: string;
  catalogItemId: string;
  delta: number;
  reason: string;
}

/** Résultat d'un conditionnement enregistré. */
export interface PackagingResult {
  /** Article `PRODUIT_FINI` du brassin (créé au premier conditionnement). */
  productItemId: string;
  lines: PackagingLineView[];
  movements: PackagingMovementView[];
}

/** Correction d'un conditionnement par mouvement inverse (append-only). */
export interface PackagingCorrectionData {
  catalogItemId: string;
  /** Delta signé : négatif pour retirer des unités saisies en trop. */
  delta: number;
  note: string;
}

export interface PackagingRepository {
  /** Conditionnements déjà enregistrés pour ce brassin. */
  listPackaging(batchId: string): Promise<PackagingLineView[]>;
  /**
   * Enregistre un conditionnement **dans une transaction unique** : mesure de
   * volume, article produit fini, lignes `BatchPackaging`, mouvement d'entrée du
   * produit fini et mouvements de sortie des contenants consommés.
   *
   * Tout échec annule l'ensemble : jamais un stock incrémenté sans ligne de
   * conditionnement, ni l'inverse.
   */
  recordPackaging(
    batchId: string,
    data: PackagingRecordData,
    userId: string | null,
  ): Promise<PackagingResult>;
  /** Écrit un mouvement de correction `ADJUSTMENT` (jamais d'UPDATE). */
  recordCorrection(
    batchId: string,
    data: PackagingCorrectionData,
    userId: string | null,
  ): Promise<PackagingMovementView>;
  /** Article `PRODUIT_FINI` du brassin, `null` s'il n'a pas encore été conditionné. */
  findProductItem(batchId: string): Promise<{ id: string; name: string } | null>;
  /** Une ligne de conditionnement précise, `null` si absente de ce brassin. */
  findLine(batchId: string, lineId: string): Promise<PackagingLineView | null>;
  /**
   * Enregistre un relevé de carbonatation sur une ligne (M9-15). Le relevé est
   * conservé **même s'il n'atteint pas la cible** : c'est un constat utile pour
   * réajuster, pas un échec à effacer.
   */
  recordCarbonationReading(
    batchId: string,
    lineId: string,
    data: CarbonationReadingData,
  ): Promise<PackagingLineView>;
  /** Délais et tolérance de mise en condition (`Settings`, ADR-01). */
  conditioningSettings(): Promise<ConditioningSettings>;
}

/** Paramètres de mise en condition lus des `Settings` (M9-15). */
export interface ConditioningSettings {
  timezone: string;
  refermentationDays: number;
  forcedCarbonationDays: number;
  /** Tolérance de pression (bar), convertie depuis les millibars stockés. */
  carbonationToleranceBar: number;
}

const LINE_SELECT = {
  id: true,
  catalogItemId: true,
  containerItemId: true,
  containerVolumeL: true,
  quantity: true,
  conditioningMethod: true,
  co2TargetVolumes: true,
  measuredPressureBar: true,
  measuredTempC: true,
  carbonationValidatedAt: true,
  availableForSaleAt: true,
  packagedAt: true,
  note: true,
} as const;

export class PrismaPackagingRepository implements PackagingRepository {
  constructor(private readonly db: PrismaClient) {}

  listPackaging(batchId: string): Promise<PackagingLineView[]> {
    return this.db.batchPackaging.findMany({
      where: { batchId },
      orderBy: { packagedAt: "asc" },
      select: LINE_SELECT,
    });
  }

  findProductItem(batchId: string): Promise<{ id: string; name: string } | null> {
    return this.db.catalogItem.findFirst({
      where: { sourceBatchId: batchId, kind: "PRODUIT_FINI" },
      select: { id: true, name: true },
    });
  }

  async recordPackaging(
    batchId: string,
    data: PackagingRecordData,
    userId: string | null,
  ): Promise<PackagingResult> {
    return this.db.$transaction(async (tx) => {
      // 1. Mesure du volume conditionné constaté (append-only, M3-06).
      await tx.batchMeasure.create({
        data: {
          batchId,
          type: "VOLUME",
          value: data.packagedVolumeL,
          unit: "L",
          phase: "CONDITIONNEMENT",
          loggedById: userId,
        },
      });

      // 2. Article produit fini du brassin — créé au premier conditionnement,
      //    retrouvé aux suivants (un conditionnement peut s'étaler sur plusieurs
      //    séances : on n'en crée pas un article de plus à chaque fois).
      const existing = await tx.catalogItem.findFirst({
        where: { sourceBatchId: batchId, kind: "PRODUIT_FINI" },
        select: { id: true },
      });
      const product =
        existing ??
        (await tx.catalogItem.create({
          data: {
            name: data.productName,
            kind: "PRODUIT_FINI",
            // Un produit fini se compte en contenants, pas en grammes ni en litres.
            unit: "UNIT",
            sourceBatchId: batchId,
          },
          select: { id: true },
        }));

      // 3. Lignes de conditionnement + mouvements.
      const lines: PackagingLineView[] = [];
      const movements: PackagingMovementView[] = [];
      let totalUnits = 0;

      for (const line of data.lines) {
        const created = await tx.batchPackaging.create({
          data: {
            batchId,
            catalogItemId: product.id,
            containerItemId: line.containerItemId,
            containerVolumeL: line.containerVolumeL,
            quantity: line.quantity,
            conditioningMethod: line.conditioningMethod,
            co2TargetVolumes: line.co2TargetVolumes,
            availableForSaleAt: line.availableForSaleAt,
            packagedById: userId,
            note: data.note,
          },
          select: LINE_SELECT,
        });
        lines.push(created);
        totalUnits += line.quantity;

        // Contenants consommés (bouteilles, fûts) : sortie de stock. Un contenant
        // non suivi au catalogue (`null`) ne produit aucun mouvement.
        // Extension possible (brief §3.J) : les bouteilles mécaniques
        // réutilisables devraient revenir en stock à la consigne — non traité ici.
        if (line.containerItemId !== null && line.quantity > 0) {
          const movement = await tx.stockMovement.create({
            data: {
              catalogItemId: line.containerItemId,
              delta: -line.quantity,
              reason: "PRODUCTION",
              batchId,
              userId,
              note: data.note,
            },
            select: { id: true, catalogItemId: true, delta: true, reason: true },
          });
          movements.push(movement);
        }
      }

      // 4. Entrée en stock du produit fini : un seul mouvement pour l'ensemble
      //    des contenants produits (l'unité est le contenant vendable).
      if (totalUnits > 0) {
        const movement = await tx.stockMovement.create({
          data: {
            catalogItemId: product.id,
            delta: totalUnits,
            reason: "PRODUCTION",
            batchId,
            userId,
            note: data.note,
          },
          select: { id: true, catalogItemId: true, delta: true, reason: true },
        });
        movements.push(movement);
      }

      return { productItemId: product.id, lines, movements };
    });
  }

  findLine(batchId: string, lineId: string): Promise<PackagingLineView | null> {
    return this.db.batchPackaging.findFirst({
      where: { id: lineId, batchId },
      select: LINE_SELECT,
    });
  }

  recordCarbonationReading(
    _batchId: string,
    lineId: string,
    data: CarbonationReadingData,
  ): Promise<PackagingLineView> {
    // Le service a déjà vérifié que la ligne appartient bien au brassin
    // (`findLine`), l'identifiant de ligne suffit donc ici.
    return this.db.batchPackaging.update({
      where: { id: lineId },
      data: {
        measuredPressureBar: data.measuredPressureBar,
        measuredTempC: data.measuredTempC,
        carbonationValidatedAt: data.carbonationValidatedAt,
        availableForSaleAt: data.availableForSaleAt,
      },
      select: LINE_SELECT,
    });
  }

  async conditioningSettings(): Promise<ConditioningSettings> {
    const settings = await this.db.settings.findFirst({
      select: {
        timezone: true,
        refermentationDays: true,
        forcedCarbonationDays: true,
        carbonationToleranceMbar: true,
      },
    });
    // Mêmes valeurs que les `@default` du schéma : une instance sans ligne
    // `Settings` reste exploitable plutôt que de bloquer un conditionnement.
    return {
      timezone: settings?.timezone ?? "Europe/Paris",
      refermentationDays: settings?.refermentationDays ?? 21,
      forcedCarbonationDays: settings?.forcedCarbonationDays ?? 7,
      // Stockée en millibar entier, exposée en bar (unité interne).
      carbonationToleranceBar: (settings?.carbonationToleranceMbar ?? 200) / 1000,
    };
  }

  async recordCorrection(
    batchId: string,
    data: PackagingCorrectionData,
    userId: string | null,
  ): Promise<PackagingMovementView> {
    return this.db.stockMovement.create({
      data: {
        catalogItemId: data.catalogItemId,
        delta: data.delta,
        reason: "ADJUSTMENT",
        batchId,
        userId,
        note: data.note,
      },
      select: { id: true, catalogItemId: true, delta: true, reason: true },
    });
  }
}
