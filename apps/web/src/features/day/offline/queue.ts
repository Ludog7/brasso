/**
 * File d'actions Jour J **hors-ligne** (M4-14, critère de démo ADR-08) — persistée
 * dans **IndexedDB** via `idb`. Chaque événement émis hors connexion y est conservé
 * avec son `clientEventId` (uuid, clé d'**idempotence** serveur M4-06) et son `at`
 * capté localement, jusqu'à un rejeu réussi via `POST /day/events:sync`.
 *
 * Le store est **clé = `clientEventId`** (un rejeu n'insère jamais de doublon) et
 * indexé par `batchId` (une file par brassin). Aucune dépendance applicative ici :
 * ce module ne fait que lire/écrire la file.
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

interface DayDB extends DBSchema {
  queue: {
    key: string;
    value: QueuedEvent;
    indexes: { "by-batch": string };
  };
}

const DB_NAME = "brasso-day";
const STORE = "queue";

let dbPromise: Promise<IDBPDatabase<DayDB>> | null = null;

function db(): Promise<IDBPDatabase<DayDB>> {
  dbPromise ??= openDB<DayDB>(DB_NAME, 1, {
    upgrade(database) {
      const store = database.createObjectStore(STORE, { keyPath: "clientEventId" });
      store.createIndex("by-batch", "batchId");
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

/** Nombre d'actions en attente pour un brassin (alimente la bannière). */
export async function countPending(batchId: string): Promise<number> {
  return (await db()).countFromIndex(STORE, "by-batch", batchId);
}

/** Vide la file (helper de test — isolation entre cas). */
export async function clearQueue(): Promise<void> {
  await (await db()).clear(STORE);
}
