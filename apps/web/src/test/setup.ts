import "@testing-library/jest-dom/vitest";
// IndexedDB n'existe pas dans jsdom : la file offline Jour J (M4-14) s'appuie sur
// une implémentation en mémoire pour les tests.
import "fake-indexeddb/auto";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Avec `globals: false`, l'auto-cleanup de Testing Library ne s'enregistre pas
// tout seul : on démonte explicitement le DOM entre chaque test.
afterEach(() => {
  cleanup();
});
