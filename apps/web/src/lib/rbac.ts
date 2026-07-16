/**
 * Gardes RBAC **côté UI** (masquage), miroir de la matrice §3.5. L'API reste
 * l'autorité (deny-by-default) : ces helpers ne font que cacher les entrées et
 * actions qu'un rôle ne peut de toute façon pas exécuter.
 */

/** Gestion du fichier membres (§3.5) : réservée à `admin` et `rgpd`. */
export function canManageMembers(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("rgpd");
}
