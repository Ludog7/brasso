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

/** Ligne de conditionnement saisie par l'opérateur. */
export interface PackagingLineInput {
  /** Article `CONDITIONNEMENT` consommé (bouteille, fût…) ; `null` si non suivi. */
  containerItemId: string | null;
  /** Volume **réellement rempli** par contenant (L). */
  containerVolumeL: number;
  quantity: number;
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
}

const LINE_SELECT = {
  id: true,
  catalogItemId: true,
  containerItemId: true,
  containerVolumeL: true,
  quantity: true,
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
