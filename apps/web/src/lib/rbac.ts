/**
 * Gardes RBAC **côté UI** (masquage), miroir de la matrice §3.5. L'API reste
 * l'autorité (deny-by-default) : ces helpers ne font que cacher les entrées et
 * actions qu'un rôle ne peut de toute façon pas exécuter.
 */

/** Gestion du fichier membres (§3.5) : réservée à `admin` et `rgpd`. */
export function canManageMembers(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("rgpd");
}

/** Journal d'audit (§3.5, ressource `auditLog`) : lecture `admin`/`rgpd`. */
export function canViewAudit(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("rgpd");
}

/**
 * Outils RGPD — export/anonymisation (§3.4, actions `export`/`anonymize`) :
 * **séparation des pouvoirs**, réservés au seul rôle `rgpd` (l'admin gère les
 * membres mais n'exporte/anonymise pas).
 */
export function canRunRgpd(roles: readonly string[]): boolean {
  return roles.includes("rgpd");
}

/** Consultation des transactions (§3.5, `transactions:read`) : admin/brasseur/caisse. */
export function canListContributions(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("brasseur") || roles.includes("caisse");
}

/**
 * Rapprochement d'une cotisation (§3.5, `membres:update` — modifie l'adhésion) :
 * `admin`/`rgpd`. NB : seul `admin` cumule lister (`transactions:read`) **et**
 * rapprocher — l'UI masque le bouton en conséquence.
 */
export function canReconcile(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("rgpd");
}
