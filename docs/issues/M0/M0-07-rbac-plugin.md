---
labels: api, feature, P0
milestone: M0 — Socle
---
# M0-07 — Plugin RBAC deny-by-default + 4 rôles (matrice §3.5)

## Contexte
ADR-10 et matrice RBAC figée §3.5. Toute route API déclare son couple (ressource, action) ; le plugin refuse par défaut (deny-by-default). Critère de démo M0 : « rôles fonctionnels ».

## Objectif
Une route protégée par `rbac('recettes', 'create')` renvoie 403 pour un rôle non autorisé et passe pour un rôle autorisé, selon la matrice §3.5.

## Périmètre technique
- Fichiers/dossiers concernés :
  - `apps/api/src/plugins/rbac.ts` (décorateur/preHandler `rbac(resource, action)`)
  - Table de permissions dérivée de la matrice §3.5 (source unique, typée)
  - Modèles `Role`, `UserRole` (Prisma, extension minimale) + 4 rôles seedés : `admin`, `brasseur`, `caisse`, `rgpd`
  - `apps/api/tests/rbac.test.ts`
- Hors périmètre explicite : routes métier réelles (arriveront par domaine).

## Spécification
- Rôles V1 : `admin`, `brasseur`, `caisse`, `rgpd`.
- Ressources/actions couvrant la matrice §3.5 : recettes/batchs/jourJ, stocks, membres, transactions/mapping, affichage, paramètres/utilisateurs, auditLog.
- **Deny-by-default** : toute route sans déclaration (resource, action) est refusée.
- Combinable avec l'auth (M0-06) : 401 si non authentifié, 403 si authentifié mais non autorisé.
- La matrice est une **donnée typée unique** (pas de checks dispersés), testée exhaustivement contre §3.5.

## Definition of Done
- [ ] Matrice §3.5 encodée et testée cellule par cellule (CRUD/R/—)
- [ ] Route sans déclaration → 403 (deny-by-default)
- [ ] 401 vs 403 corrects
- [ ] Tests Vitest verts
- [ ] Lint + CI verte
- [ ] Critère fonctionnel observable : démo M0 « login, rôles fonctionnels »

## Dépendances
Bloqué par : {{M0-06}} — Bloque : —
