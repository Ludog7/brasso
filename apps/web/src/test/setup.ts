import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Avec `globals: false`, l'auto-cleanup de Testing Library ne s'enregistre pas
// tout seul : on démonte explicitement le DOM entre chaque test.
afterEach(() => {
  cleanup();
});
