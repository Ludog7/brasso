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
 * Accès à l'espace caisse (§3.5, `transactions:read`) : admin/brasseur/caisse —
 * l'écran (liste transactions + mappings en lecture) est **masqué à `rgpd`**.
 */
export function canAccessCash(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("brasseur") || roles.includes("caisse");
}

/**
 * Gestion des mappings SKU (§3.5, `mapping` CRUD) : `admin`/`caisse`. `brasseur`
 * voit en lecture (l'UI masque les actions d'écriture ; l'API reste l'autorité).
 */
export function canManageMapping(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("caisse");
}

/**
 * Consultation du dashboard des anomalies d'intégration (§3.6, `transactions:read`) :
 * admin/brasseur/caisse — écran **masqué à `rgpd`**.
 */
export function canViewAlerts(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("brasseur") || roles.includes("caisse");
}

/**
 * Résolution d'une anomalie (§3.6, `mapping:update` — l'ajustement de stock manuel
 * est du même ressort que le mapping) : `admin`/`caisse`. `brasseur` voit sans agir.
 */
export function canResolveAlerts(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("caisse");
}

/**
 * Téléchargement des exports CSV comptables (§3.6, `transactions:read`) :
 * admin/brasseur/caisse — écran **masqué à `rgpd`**.
 */
export function canExportAccounting(roles: readonly string[]): boolean {
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
