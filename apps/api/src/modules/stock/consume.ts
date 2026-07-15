/**
 * Déduction de stock à l'ensemencement (M5-05) — cœur du critère de démo M5.
 *
 * À l'entrée d'un batch en `EN_FERMENTATION`, ses réservations `RESERVED`
 * (posées au volume **planifié** à la planification, M3-05) sont consommées :
 * passées `CONSUMED` et matérialisées en `StockMovement` `PRODUCTION` négatifs,
 * **ajustés au volume réel** (§Stock « déduction effective basée sur volume
 * réel »). L'opération est **idempotente** (aucune réservation RESERVED → no-op)
 * et **atomique** (appliquée dans la transaction du passage `EN_FERMENTATION`).
 *
 * La logique métier vit ici, au-dessus d'un **port étroit** : l'adaptateur Prisma
 * (`prismaConsumePort`) l'exécute sur un client de transaction ; les tests
 * fournissent un adaptateur en mémoire. Zéro dépendance au réducteur pur
 * `transition` (M1-13 sanctuarisé) : la consommation est un **effet**, pas une
 * transition core.
 */

import { scaleQuantityToVolume } from "@brasso/core";
import type { Prisma } from "@brasso/db";

/** Réservation `RESERVED` à consommer (quantité dans l'unité de l'article). */
export interface ConsumeReservation {
  id: string;
  catalogItemId: string;
  quantity: number;
}

/** Un mouvement `PRODUCTION` généré (quantité consommée, positive). */
export interface ConsumedMovementView {
  catalogItemId: string;
  quantity: number;
  movementId: string;
}

/** Résultat de consommation : `alreadyDone` = rien à faire (idempotence). */
export interface ConsumeResult {
  consumed: number;
  movements: ConsumedMovementView[];
  alreadyDone: boolean;
}

/**
 * Port d'accès aux données nécessaires à la consommation, découplé du backend
 * (Prisma tx / mémoire). Toutes les opérations d'un même appel partagent la même
 * unité de travail (transaction) côté adaptateur.
 */
export interface ConsumePort {
  /** Réservations `RESERVED` du batch (les seules à consommer). */
  listReserved(batchId: string): Promise<ConsumeReservation[]>;
  /** Volume planifié (L) du `recipeSnapshot` figé, ou `null` si indisponible. */
  plannedVolumeL(batchId: string): Promise<number | null>;
  /** Dernière mesure `VOLUME` (L) du batch, ou `null` si aucune. */
  latestVolumeMeasureL(batchId: string): Promise<number | null>;
  /** Insère un mouvement `PRODUCTION` (`delta` signé) ; renvoie son id. */
  createProductionMovement(input: {
    catalogItemId: string;
    delta: number;
    batchId: string;
    actorId: string | null;
  }): Promise<string>;
  /** Passe une réservation à `CONSUMED`. */
  markConsumed(reservationId: string): Promise<void>;
}

/**
 * Ajuste une quantité réservée au volume réel. Sans les deux volumes exploitables
 * (planifié > 0 **et** mesure de volume présente), aucun ajustement — on consomme
 * la quantité planifiée telle quelle (§M5-05 : « à défaut, pas d'ajustement »).
 */
function adjustToVolume(
  quantity: number,
  plannedVolumeL: number | null,
  actualVolumeL: number | null,
): number {
  if (plannedVolumeL === null || !(plannedVolumeL > 0) || actualVolumeL === null) {
    return quantity;
  }
  return scaleQuantityToVolume(quantity, plannedVolumeL, actualVolumeL);
}

/**
 * Consomme les réservations `RESERVED` d'un batch à l'ensemencement. Idempotent :
 * un 2ᵉ appel (double chemin `changeStatus`/clôture Jour J, rejeu offline) ne
 * trouve plus de réservation `RESERVED` → no-op.
 */
export async function consumeReservationsForBatch(
  port: ConsumePort,
  batchId: string,
  actorId: string | null,
): Promise<ConsumeResult> {
  const reserved = await port.listReserved(batchId);
  if (reserved.length === 0) {
    return { consumed: 0, movements: [], alreadyDone: true };
  }

  const plannedVolumeL = await port.plannedVolumeL(batchId);
  const actualVolumeL = await port.latestVolumeMeasureL(batchId);

  const movements: ConsumedMovementView[] = [];
  for (const reservation of reserved) {
    const quantity = adjustToVolume(reservation.quantity, plannedVolumeL, actualVolumeL);
    const movementId = await port.createProductionMovement({
      catalogItemId: reservation.catalogItemId,
      delta: -quantity,
      batchId,
      actorId,
    });
    await port.markConsumed(reservation.id);
    movements.push({ catalogItemId: reservation.catalogItemId, quantity, movementId });
  }
  return { consumed: reserved.length, movements, alreadyDone: false };
}

/** Lecture défensive d'un objet JSON (`null` si non-objet). */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Volume de brassin planifié depuis le `recipeSnapshot` figé (JSONB opaque) :
 * `batchVolumeL` du bloc de détail moteur présent (BEER / ALT / SOFT). `null` si
 * absent → aucun ajustement au volume réel.
 */
export function plannedVolumeFromSnapshot(snapshot: unknown): number | null {
  const root = asRecord(snapshot);
  if (!root) return null;
  for (const key of ["beerDetails", "altDetails", "softDetails"] as const) {
    const details = asRecord(root[key]);
    const volume = details?.batchVolumeL;
    if (typeof volume === "number" && Number.isFinite(volume) && volume > 0) {
      return volume;
    }
  }
  return null;
}

/** Adaptateur Prisma du port de consommation, adossé à un client de transaction. */
export function prismaConsumePort(tx: Prisma.TransactionClient): ConsumePort {
  return {
    listReserved(batchId) {
      return tx.stockReservation.findMany({
        where: { batchId, status: "RESERVED" },
        select: { id: true, catalogItemId: true, quantity: true },
      });
    },
    async plannedVolumeL(batchId) {
      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        select: { recipeSnapshot: true },
      });
      return plannedVolumeFromSnapshot(batch?.recipeSnapshot);
    },
    async latestVolumeMeasureL(batchId) {
      const measure = await tx.batchMeasure.findFirst({
        where: { batchId, type: "VOLUME" },
        orderBy: { loggedAt: "desc" },
        select: { value: true },
      });
      return measure?.value ?? null;
    },
    async createProductionMovement({ catalogItemId, delta, batchId, actorId }) {
      const movement = await tx.stockMovement.create({
        data: { catalogItemId, delta, reason: "PRODUCTION", batchId, userId: actorId },
        select: { id: true },
      });
      return movement.id;
    },
    async markConsumed(reservationId) {
      await tx.stockReservation.update({
        where: { id: reservationId },
        data: { status: "CONSUMED" },
      });
    },
  };
}
