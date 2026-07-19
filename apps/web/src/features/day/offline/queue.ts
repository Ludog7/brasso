/**
 * File d'actions Jour J **hors-ligne** (M4-14, critère de démo ADR-08) — persistée
 * dans **IndexedDB** via `idb`. Chaque événement émis hors connexion y est conservé
 * avec son `clientEventId` (uuid, clé d'**idempotence** serveur M4-06) et son `at`
 * capté localement, jusqu'à un rejeu réussi via `POST /day/events:sync`.
 *
 * Le store est **clé = `clientEventId`** (un rejeu n'insère jamais de doublon) et
 * indexé par `batchId` (une file par brassin). Aucune dépendance applicative ici :
 * ce module ne fait que lire/écrire la file.
 *
 * Un **second store** (`cyclePlan`, M9-12) accueille la planification du cycle
 * saisie en fin d'ensemencement. Elle ne passe pas par `:sync` — ce n'est pas un
 * événement de la state machine mais un `POST /batches/:id/milestones`, lui aussi
 * idempotent (M9-07). Elle vit néanmoins ici : une seule base, une seule
 * ouverture, un seul compteur d'actions en attente pour la bannière atelier.
 */

import type { DayEvent } from "@brasso/core";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

/** Entrée de file : l'événement core (avec `at`) + ses clés d'identité/idempotence. */
export interface QueuedEvent {
  /** UUID client — clé d'idempotence rejouée par `:sync` (M4-06). */
  clientEventId: string;
  batchId: string;
  /** Événement pur de la state machine, `at` **capté à l'action** (déterminisme M1-13). */
  event: DayEvent;
}

/**
 * Planification de cycle en attente (M9-12). **Une par brassin** (`batchId` en
 * clé) : la séquence se crée une fois, et une nouvelle saisie hors ligne remplace
 * la précédente plutôt que d'empiler deux planifications contradictoires.
 */
export interface QueuedCyclePlan {
  batchId: string;
  /**
   * Corps de `POST /batches/:id/milestones`, **`pitchedAt` compris**, figé à la
   * saisie. Sans lui, un rejeu le lendemain matin daterait tout le cycle depuis
   * la reconnexion au lieu de l'ensemencement réel.
   */
  payload: Record<string, unknown>;
}

interface DayDB extends DBSchema {
  queue: {
    key: string;
    value: QueuedEvent;
    indexes: { "by-batch": string };
  };
  cyclePlan: {
    key: string;
    value: QueuedCyclePlan;
  };
}

const DB_NAME = "brasso-day";
const STORE = "queue";
const CYCLE_STORE = "cyclePlan";

let dbPromise: Promise<IDBPDatabase<DayDB>> | null = null;

function db(): Promise<IDBPDatabase<DayDB>> {
  // Migration cumulative (`oldVersion`) et non un `upgrade` qui repartirait de
  // zéro : une tablette d'atelier peut ouvrir la v2 avec une file v1 **non
  // vidée** — la recréer perdrait les actions qu'elle contient.
  dbPromise ??= openDB<DayDB>(DB_NAME, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const store = database.createObjectStore(STORE, { keyPath: "clientEventId" });
        store.createIndex("by-batch", "batchId");
      }
      if (oldVersion < 2) {
        database.createObjectStore(CYCLE_STORE, { keyPath: "batchId" });
      }
    },
  });
  return dbPromise;
}

/** Ajoute (ou remplace, même `clientEventId`) un événement dans la file. */
export async function enqueueEvent(entry: QueuedEvent): Promise<void> {
  await (await db()).put(STORE, entry);
}

/** Événements en attente pour un brassin (ordre d'insertion ; le tri par `at` est fait au flush). */
export async function pendingEvents(batchId: string): Promise<QueuedEvent[]> {
  return (await db()).getAllFromIndex(STORE, "by-batch", batchId);
}

/** Retire de la file les événements rejoués (appliqués, ignorés **ou** refusés — pas de boucle). */
export async function removeEvents(clientEventIds: string[]): Promise<void> {
  if (clientEventIds.length === 0) return;
  const database = await db();
  const tx = database.transaction(STORE, "readwrite");
  await Promise.all(clientEventIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

/** Met en attente la planification de cycle d'un brassin (remplace la précédente). */
export async function enqueueCyclePlan(entry: QueuedCyclePlan): Promise<void> {
  await (await db()).put(CYCLE_STORE, entry);
}

/** Planification de cycle en attente pour un brassin, ou `null`. */
export async function pendingCyclePlan(batchId: string): Promise<QueuedCyclePlan | null> {
  return (await (await db()).get(CYCLE_STORE, batchId)) ?? null;
}

/** Retire la planification rejouée (appliquée **ou** refusée — pas de boucle). */
export async function removeCyclePlan(batchId: string): Promise<void> {
  await (await db()).delete(CYCLE_STORE, batchId);
}

/**
 * Nombre d'actions en attente pour un brassin (alimente la bannière). La
 * planification de cycle y compte : hors ligne, elle est la **dernière** action
 * du Jour J, et une bannière à zéro laisserait croire que tout est remonté.
 */
export async function countPending(batchId: string): Promise<number> {
  const database = await db();
  const events = await database.countFromIndex(STORE, "by-batch", batchId);
  const plan = (await database.get(CYCLE_STORE, batchId)) ? 1 : 0;
  return events + plan;
}

/** Vide les deux files (helper de test — isolation entre cas). */
export async function clearQueue(): Promise<void> {
  const database = await db();
  await database.clear(STORE);
  await database.clear(CYCLE_STORE);
}
