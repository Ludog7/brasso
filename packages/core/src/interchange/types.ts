/**
 * Format d'échange propriétaire `brasso-recipe` (v1) — moteurs ALT_FERMENTED /
 * SOFT_DRINK (spec fonctionnelle « Format JSON propriétaire »). Enveloppe
 * versionnée, autoportante et partageable entre membres/instances, exprimée en
 * **unités internes** (`units.ts` : g, L, °C, fractions).
 *
 * Le moteur BEER n'entre **pas** dans ce format : il passe par BeerXML (M2-10).
 * Les erreurs ci-dessous sont **typées** pour que l'API (M2-12) les traduise en
 * réponses HTTP explicites.
 */

import type { z } from "zod";

/** Discriminant d'entête : identifie un document `brasso-recipe`. */
export const BRASSO_RECIPE_FORMAT = "brasso-recipe" as const;

/** Version courante du format d'échange (unique version supportée à ce jour). */
export const BRASSO_RECIPE_FORMAT_VERSION = 1 as const;

/**
 * `formatVersion` inconnu à l'import : le document a été produit par une version
 * du format que ce `core` ne sait pas lire (montée de version future).
 */
export class BrassoRecipeVersionError extends Error {
  readonly formatVersion: unknown;
  constructor(formatVersion: unknown) {
    super(
      `Version de format brasso-recipe non supportée : ${String(formatVersion)} ` +
        `(attendu : ${BRASSO_RECIPE_FORMAT_VERSION}).`,
    );
    this.name = "BrassoRecipeVersionError";
    this.formatVersion = formatVersion;
  }
}

/**
 * Moteur non géré par le format propriétaire (BEER). Renvoie vers l'import/export
 * BeerXML (M2-10), seul canal du moteur BEER.
 */
export class BrassoRecipeEngineError extends Error {
  readonly engine: string;
  constructor(engine: string) {
    super(
      `Le moteur ${engine} n'est pas géré par le format JSON propriétaire ; ` +
        `utilisez l'import/export BeerXML pour le moteur BEER.`,
    );
    this.name = "BrassoRecipeEngineError";
    this.engine = engine;
  }
}

/**
 * Enveloppe invalide au regard du schéma Zod strict. `paths` liste les chemins
 * fautifs (ex. `recipe.altDetails.stabilizationMethod`) ; `issues` conserve le
 * détail Zod pour l'API.
 */
export class BrassoRecipeValidationError extends Error {
  readonly issues: readonly z.ZodIssue[];
  readonly paths: readonly string[];
  constructor(issues: readonly z.ZodIssue[]) {
    const paths = issues.map((issue) => issue.path.join(".") || "(racine)");
    super(`JSON brasso-recipe invalide — champs fautifs : ${paths.join(", ")}.`);
    this.name = "BrassoRecipeValidationError";
    this.issues = issues;
    this.paths = paths;
  }
}
