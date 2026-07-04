import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Couverture core ≥ 90 % (CLAUDE.md). Gate CI branchée en M1-14 ;
      // vérifiable dès maintenant via `pnpm --filter @brasso/core test:coverage`.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
