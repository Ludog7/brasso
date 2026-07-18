/**
 * Conditionnement d'un brassin → **stock de produits finis** (M9-08).
 *
 * Pièce maîtresse de M9 : c'est l'étape qui rend une bière brassée *vendable*.
 * Le produit fini étant un `CatalogItem` (Q10), il devient mappable en caisse
 * (`SkuMapping`) et affichable au bar (`DisplayScreenItem`) **sans modifier le
 * pipeline M7** — la vente le décrémente par le chemin existant.
 *
 * Répartition en contenants déléguée à `splitIntoContainers` (`core`, FORMULES
 * §13.3) : c'est une **aide à la saisie**, les quantités enregistrées restent
 * celles de l'opérateur.
 */

import type { ContainerSpec, PackagingSplit } from "@brasso/core";
import { packagedVolumeFromLines, splitIntoContainers } from "@brasso/core";

import type {
  PackagingCorrectionData,
  PackagingLineView,
  PackagingMovementView,
  PackagingRepository,
  PackagingResult,
} from "./packaging.repository.js";
import type { BatchRepository } from "./repository.js";
import type {
  PackagingCorrectionBody,
  PackagingRecordBody,
  PackagingSplitQuery,
} from "./schema.js";
import { BatchNotFoundError, BatchService } from "./service.js";

/**
 * Conditionnement refusé : le brassin n'est pas à un stade où il peut l'être
 * (pas encore fermenté, déjà terminé, annulé) → 409.
 */
export class BatchNotPackageableError extends Error {
  readonly statusCode = 409;
  readonly code = "BATCH_NOT_PACKAGEABLE";
  constructor(id: string, status: string) {
    super(
      `Le brassin ${id} (${status}) ne peut pas être conditionné : il doit être en fermentation ou en conditionnement`,
    );
    this.name = "BatchNotPackageableError";
  }
}

/** Correction refusée : le brassin n'a aucun produit fini à corriger → 409. */
export class NothingToCorrectError extends Error {
  readonly statusCode = 409;
  readonly code = "NOTHING_TO_CORRECT";
  constructor(id: string) {
    super(`Le brassin ${id} n'a pas encore été conditionné : aucun stock à corriger`);
    this.name = "NothingToCorrectError";
  }
}

/** Réponse d'un conditionnement enregistré. */
export interface PackagingRecordResult extends PackagingResult {
  /** Volume conditionné total (L), déduit des contenants saisis. */
  packagedVolumeL: number;
  /** Statut du brassin après enregistrement (`TERMINE`). */
  batchStatus: string;
}

/**
 * Statuts depuis lesquels un conditionnement est recevable. `EN_FERMENTATION`
 * est admis avec passage explicite : à l'atelier on conditionne en sortie de
 * garde sans toujours avoir cliqué le cran administratif intermédiaire, et
 * refuser pour cette seule raison ferait perdre la saisie.
 */
const PACKAGEABLE = new Set(["EN_FERMENTATION", "EN_CONDITIONNEMENT"]);

export class BatchPackagingService {
  constructor(
    private readonly packaging: PackagingRepository,
    private readonly batches: BatchRepository,
    private readonly batchService: BatchService,
  ) {}

  /**
   * Propose une répartition d'un volume en contenants (FORMULES §13.3).
   * **Aide à la saisie** : rien n'est écrit, l'opérateur reste maître des
   * quantités qu'il enregistrera.
   */
  proposeSplit(query: PackagingSplitQuery): PackagingSplit {
    const containers: ContainerSpec[] = query.containers.map((c) => ({
      id: c.id,
      volumeL: c.volumeL,
    }));
    return splitIntoContainers(query.volumeL, containers);
  }

  /** Conditionnements déjà enregistrés (404 si le brassin n'existe pas). */
  async list(batchId: string): Promise<PackagingLineView[]> {
    await this.requireBatch(batchId);
    return this.packaging.listPackaging(batchId);
  }

  /**
   * Enregistre un conditionnement : lignes, article produit fini, mouvements de
   * stock, puis passage du brassin en `TERMINE`.
   *
   * L'écriture est **atomique** côté repository ; la transition de statut suit,
   * une fois le stock effectivement écrit — l'inverse laisserait un brassin
   * terminé sans stock si l'écriture échouait.
   */
  async record(
    batchId: string,
    body: PackagingRecordBody,
    userId: string | null,
  ): Promise<PackagingRecordResult> {
    const batch = await this.requireBatch(batchId);
    if (!PACKAGEABLE.has(batch.status)) {
      throw new BatchNotPackageableError(batchId, batch.status);
    }

    // Le volume conditionné se **déduit des contenants saisis** (M9-06) : il ne
    // se relève pas en vrac, sans quoi les deux chiffres divergeraient.
    const packagedVolumeL = packagedVolumeFromLines(body.lines) ?? 0;

    const result = await this.packaging.recordPackaging(
      batchId,
      {
        lines: body.lines.map((l) => ({
          containerItemId: l.containerItemId ?? null,
          containerVolumeL: l.containerVolumeL,
          quantity: l.quantity,
        })),
        packagedVolumeL,
        productName: body.productName ?? defaultProductName(batch.batchNumber),
        note: body.note ?? null,
      },
      userId,
    );

    // Le brassin est conditionné : on le mène à `TERMINE`, en passant par le
    // cran intermédiaire si l'opérateur ne l'avait pas franchi. `changeStatus`
    // reste autoritaire sur la légalité des transitions (M9-07).
    const batchStatus = await this.completeBatch(batchId, batch.status, userId);

    return { ...result, packagedVolumeL, batchStatus };
  }

  /**
   * Corrige un conditionnement par **mouvement inverse** (`ADJUSTMENT`) : le
   * registre est append-only (§3.3), une saisie erronée ne se modifie ni ne se
   * supprime. La note est obligatoire — une correction sans motif est
   * intraçable, ce qui vide la correction de son intérêt.
   */
  async correct(
    batchId: string,
    body: PackagingCorrectionBody,
    userId: string | null,
  ): Promise<PackagingMovementView> {
    await this.requireBatch(batchId);
    const product = await this.packaging.findProductItem(batchId);
    if (!product) throw new NothingToCorrectError(batchId);

    const data: PackagingCorrectionData = {
      catalogItemId: body.catalogItemId ?? product.id,
      delta: body.delta,
      note: body.note,
    };
    return this.packaging.recordCorrection(batchId, data, userId);
  }

  private async requireBatch(batchId: string) {
    const batch = await this.batches.findById(batchId);
    if (!batch) throw new BatchNotFoundError(batchId);
    return batch;
  }

  /** Mène le brassin jusqu'à `TERMINE` depuis son statut courant. */
  private async completeBatch(
    batchId: string,
    from: string,
    userId: string | null,
  ): Promise<string> {
    if (from === "EN_FERMENTATION") {
      await this.batchService.changeStatus(batchId, "EN_CONDITIONNEMENT", userId);
    }
    const { batch } = await this.batchService.changeStatus(batchId, "TERMINE", userId);
    return batch.status;
  }
}

/**
 * Nom par défaut d'un article produit fini. Le numéro de brassin y figure
 * **toujours** : c'est lui qui distingue deux lots d'une même recette en rayon,
 * et donc ce qui rend un rappel de lot possible.
 */
function defaultProductName(batchNumber: number): string {
  return `Brassin n°${batchNumber}`;
}
