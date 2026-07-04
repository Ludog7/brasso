/**
 * Matrice RBAC — source **unique** et **typée** de la §3.5 (figée V1, ADR-10).
 *
 * Aucun contrôle d'accès n'est éparpillé ailleurs : les routes déclarent un
 * couple `(resource, action)` (voir `plugins/rbac.ts`) et l'autorisation se
 * résout ici. Deny-by-default : toute combinaison non listée est refusée.
 *
 * Toute évolution de la matrice = ticket `type:adr` (la §3.5 est figée).
 */

/** Les 4 rôles V1. `key` en base (`Role.key`) = ces littéraux. */
export const ROLES = ["admin", "brasseur", "caisse", "rgpd"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Ressources protégées. `transactions` (externes, read-only ADR-09) et
 * `mapping` (SKU) sont deux ressources distinctes car la caisse a des droits
 * asymétriques dessus (R transactions / CRUD mapping).
 */
export const RESOURCES = [
  "recettes",
  "stocks",
  "membres",
  "transactions",
  "mapping",
  "affichage",
  "parametres",
  "auditLog",
] as const;
export type Resource = (typeof RESOURCES)[number];

/**
 * Actions. CRUD + deux actions RGPD spécifiques aux membres (`export`,
 * `anonymize`) : séparation des pouvoirs — l'admin gère les membres mais seul
 * le rôle `rgpd` peut exporter / anonymiser les données personnelles (§3.4).
 */
export const ACTIONS = ["create", "read", "update", "delete", "export", "anonymize"] as const;
export type Action = (typeof ACTIONS)[number];

// Raccourcis lisibles reproduisant la notation de la matrice §3.5.
const CRUD = ["create", "read", "update", "delete"] as const satisfies readonly Action[];
const R = ["read"] as const satisfies readonly Action[];
const RU = ["read", "update"] as const satisfies readonly Action[];
const NONE = [] as const satisfies readonly Action[];

/**
 * Matrice §3.5 encodée cellule par cellule. Lignes = ressources, colonnes =
 * rôles — même disposition que la spec, pour relecture directe.
 *
 * | Ressource      | admin | brasseur | caisse       | rgpd                 |
 * |----------------|-------|----------|--------------|----------------------|
 * | Recettes/…     | CRUD  | CRUD     | R            | —                    |
 * | Stocks         | CRUD  | CRUD     | R            | —                    |
 * | Membres        | CRUD  | —        | —            | CRUD + export/anon.  |
 * | Transactions   | CRUD  | R        | R            | —                    |
 * | Mapping SKU    | CRUD  | R        | CRUD         | —                    |
 * | Affichage      | CRUD  | RU       | RU           | —                    |
 * | Paramètres/usr | CRUD  | —        | —            | —                    |
 * | AuditLog       | R     | —        | —            | R                    |
 */
export const RBAC_MATRIX: Record<Resource, Record<Role, readonly Action[]>> = {
  recettes: { admin: CRUD, brasseur: CRUD, caisse: R, rgpd: NONE },
  stocks: { admin: CRUD, brasseur: CRUD, caisse: R, rgpd: NONE },
  membres: {
    admin: CRUD,
    brasseur: NONE,
    caisse: NONE,
    rgpd: [...CRUD, "export", "anonymize"],
  },
  transactions: { admin: CRUD, brasseur: R, caisse: R, rgpd: NONE },
  mapping: { admin: CRUD, brasseur: R, caisse: CRUD, rgpd: NONE },
  affichage: { admin: CRUD, brasseur: RU, caisse: RU, rgpd: NONE },
  parametres: { admin: CRUD, brasseur: NONE, caisse: NONE, rgpd: NONE },
  auditLog: { admin: R, brasseur: NONE, caisse: NONE, rgpd: R },
};

/** Garde de type : `value` est-il un rôle connu ? (les rôles DB sont libres.) */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Un **rôle unique** est-il autorisé pour `(resource, action)` ?
 * Deny-by-default : rôle inconnu ou cellule vide → `false`.
 */
export function roleCan(role: string, resource: Resource, action: Action): boolean {
  if (!isRole(role)) {
    return false;
  }
  return RBAC_MATRIX[resource][role].includes(action);
}

/**
 * Un **ensemble de rôles** (union des droits) est-il autorisé ? Un utilisateur
 * cumulant plusieurs rôles obtient l'union de leurs permissions.
 */
export function can(roles: readonly string[], resource: Resource, action: Action): boolean {
  return roles.some((role) => roleCan(role, resource, action));
}
