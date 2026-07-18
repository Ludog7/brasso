import "@testing-library/jest-dom/vitest";
// IndexedDB n'existe pas dans jsdom : la file offline Jour J (M4-14) s'appuie sur
// une implémentation en mémoire pour les tests.
import "fake-indexeddb/auto";

import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Code-splitting par route (M8-07) : chaque page est montée derrière un import
// dynamique + une résolution Suspense. Sous la charge du runner CI, ce hop async
// supplémentaire fait parfois dépasser le délai par défaut (1000 ms) des utilitaires
// asynchrones (`findBy*`, `waitFor`). On élargit la marge — la résolution reste
// immédiate dès que l'élément apparaît, donc aucun ralentissement des tests verts.
configure({ asyncUtilTimeout: 5000 });

// Avec `globals: false`, l'auto-cleanup de Testing Library ne s'enregistre pas
// tout seul : on démonte explicitement le DOM entre chaque test.
afterEach(() => {
  cleanup();
});
