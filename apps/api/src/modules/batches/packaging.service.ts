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

import type { CarbonationCheck, ContainerSpec, PackagingSplit } from "@brasso/core";
import {
  calendarDateInZone,
  checkCarbonation,
  packagedVolumeFromLines,
  saleAvailability,
  splitIntoContainers,
  targetCarbonationPressureBar,
} from "@brasso/core";

import type {
  ConditioningMethod,
  PackagingCorrectionData,
  PackagingLineView,
  PackagingMovementView,
  PackagingRepository,
  PackagingResult,
} from "./packaging.repository.js";
import type { BatchRepository } from "./repository.js";
import type {
  CarbonationReadingBody,
  CarbonationTargetQuery,
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

/** Ligne de conditionnement introuvable sur ce brassin → 404. */
export class PackagingLineNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "PACKAGING_LINE_NOT_FOUND";
  constructor(batchId: string, lineId: string) {
    super(`Le brassin ${batchId} ne comporte pas de ligne de conditionnement ${lineId}`);
    this.name = "PackagingLineNotFoundError";
  }
}

/**
 * Relevé de pression refusé : la ligne n'est pas en carbonatation forcée → 409.
 * Une bouteille se carbonate par refermentation, il n'y a pas de détendeur à
 * relever.
 */
export class NotForcedCarbonationError extends Error {
  readonly statusCode = 409;
  readonly code = "NOT_FORCED_CARBONATION";
  constructor(lineId: string, method: string) {
    super(
      `La ligne ${lineId} est en mise en condition « ${method} » : un relevé de pression ne s'applique qu'à une carbonatation forcée`,
    );
    this.name = "NotForcedCarbonationError";
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
 * Verdict d'un relevé de carbonatation (M9-15). ADR-11 : `onTarget` dit que la
 * mesure **atteint la cible**, ce qui est une aide à la décision — jamais une
 * attestation de conformité du produit.
 */
export interface CarbonationReadingResult extends CarbonationCheck {
  line: PackagingLineView;
  /** Date estimée de mise en vente (`YYYY-MM-DD`), `null` si la cible n'est pas atteinte. */
  availableForSaleDate: string | null;
  /** Ce qu'il reste à faire, à afficher tel quel ; `null` si une date existe. */
  pendingReason: string | null;
}

/**
 * Ligne de conditionnement exposée par l'API : l'instant **et** la date
 * calendaire de mise en vente, dans le fuseau de l'instance.
 *
 * Les deux, pour la même raison qu'en M9-07 : une disponibilité à minuit heure
 * de Paris se sérialise `…T22:00:00Z` la veille, et un consommateur qui tronque
 * l'ISO annoncerait la bière vendable un jour trop tôt.
 */
export interface PackagingLineApiView extends PackagingLineView {
  /** Date calendaire de mise en vente (`YYYY-MM-DD`), `null` si non estimée. */
  availableForSaleDate: string | null;
}

const toLineApiView = (line: PackagingLineView, timezone: string): PackagingLineApiView => ({
  ...line,
  availableForSaleDate:
    line.availableForSaleAt === null
      ? null
      : calendarDateInZone(line.availableForSaleAt.getTime(), timezone),
});

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
  async list(batchId: string): Promise<PackagingLineApiView[]> {
    await this.requireBatch(batchId);
    const [lines, settings] = await Promise.all([
      this.packaging.listPackaging(batchId),
      this.packaging.conditioningSettings(),
    ]);
    return lines.map((line) => toLineApiView(line, settings.timezone));
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

    // Mise en condition (M9-15) : une refermentation démarre dès la mise en
    // bouteille, donc sa date de vente est connue tout de suite. Une
    // carbonatation forcée attend le relevé de pression — on ne promet pas une
    // bière prête alors que le fût peut être resté plat.
    const settings = await this.packaging.conditioningSettings();
    const packagedAt = Date.now();

    const result = await this.packaging.recordPackaging(
      batchId,
      {
        lines: body.lines.map((l) => {
          const method: ConditioningMethod = l.conditioningMethod ?? "NONE";
          const availability = saleAvailability({
            method,
            packagedAt,
            delays: settings,
            timezone: settings.timezone,
          });
          return {
            containerItemId: l.containerItemId ?? null,
            containerVolumeL: l.containerVolumeL,
            quantity: l.quantity,
            conditioningMethod: method,
            co2TargetVolumes: l.co2TargetVolumes ?? null,
            availableForSaleAt:
              availability.availableAt === null ? null : new Date(availability.availableAt),
          };
        }),
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
   * Pression à régler au détendeur (bar) pour un CO₂ visé à une température —
   * aide au réglage, avant tout relevé. N'écrit rien (FORMULES §8.2).
   */
  async targetPressure(query: CarbonationTargetQuery): Promise<{
    targetBar: number;
    toleranceBar: number;
  }> {
    const { carbonationToleranceBar } = await this.packaging.conditioningSettings();
    return {
      targetBar: targetCarbonationPressureBar(
        query.co2TargetVolumes,
        query.tempC,
        query.altitudeFt ?? 0,
      ),
      toleranceBar: carbonationToleranceBar,
    };
  }

  /**
   * Enregistre un relevé de carbonatation forcée sur une ligne de fûts.
   *
   * La cible est **recalculée à la température relevée** : une bière plus chaude
   * demande davantage de pression pour le même CO₂ dissous, et juger contre la
   * cible d'une autre température validerait une bière plate.
   *
   * Un relevé qui n'atteint pas la cible est **conservé et signalé**, sans fixer
   * de date de mise en vente : c'est un constat qui permet de réajuster le
   * détendeur et de relever à nouveau, pas un échec à effacer.
   */
  async recordCarbonationReading(
    batchId: string,
    lineId: string,
    body: CarbonationReadingBody,
  ): Promise<CarbonationReadingResult> {
    await this.requireBatch(batchId);
    const line = await this.packaging.findLine(batchId, lineId);
    if (!line) throw new PackagingLineNotFoundError(batchId, lineId);
    if (line.conditioningMethod !== "FORCED_CARBONATION") {
      throw new NotForcedCarbonationError(lineId, line.conditioningMethod);
    }

    const settings = await this.packaging.conditioningSettings();
    const check = checkCarbonation(
      line.co2TargetVolumes ?? 0,
      body.pressureBar,
      body.tempC,
      settings.carbonationToleranceBar,
      body.altitudeFt ?? 0,
    );

    const validatedAt = check.onTarget ? new Date() : null;
    const availability = saleAvailability({
      method: "FORCED_CARBONATION",
      packagedAt: line.packagedAt.getTime(),
      carbonationValidatedAt: validatedAt?.getTime() ?? null,
      delays: settings,
      timezone: settings.timezone,
    });

    const updated = await this.packaging.recordCarbonationReading(batchId, lineId, {
      measuredPressureBar: body.pressureBar,
      measuredTempC: body.tempC,
      carbonationValidatedAt: validatedAt,
      availableForSaleAt:
        availability.availableAt === null ? null : new Date(availability.availableAt),
    });

    return {
      ...check,
      line: updated,
      availableForSaleDate: availability.availableDate,
      pendingReason: availability.pendingReason,
    };
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
