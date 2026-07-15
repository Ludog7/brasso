---
labels: api, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-03 — api : journal d'audit (helper d'écriture append-only + consultation)

## Contexte
Le RGPD by design (§6) impose un **AuditLog sur toute lecture de données personnelles et toute action sensible**. Le modèle `AuditLog` existe depuis {{M1-01}} (append-only, **verrouillé par trigger** contre UPDATE/DELETE ; `memberId` **scalaire volontaire, sans FK** → l'audit survit à l'anonymisation). Ce ticket livre l'**infrastructure d'audit** transversale que consommeront les tickets membres/RGPD/rapprochement (M6-04/05/06/08) et expose sa **consultation** (matrice §3.5 : `auditLog` = R pour `admin` et `rgpd` uniquement). SOURCE : `SPEC-ORCHESTRATION.md` §3.4, §3.5, §6.

## Objectif
L'API fournit un helper `recordAudit(...)` réutilisable (écriture append-only) et une route `GET /audit` filtrable, protégée par RBAC `auditLog:read`.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/api/src/modules/audit/{repository,service,schema,routes}.ts` (nouveau module) + câblage `app.ts`, helper d'écriture réutilisable (exporté du service), tests `apps/api/test/`.
- Hors périmètre explicite : câblage de l'audit **dans** les endpoints membres/RGPD (fait par {{M6-04}}, {{M6-05}}, {{M6-06}}, {{M6-08}} qui appellent le helper) ; UI de consultation ({{M6-10}}). Ne pas toucher le trigger append-only (déjà en base).

## Spécification
- **Helper d'écriture** `recordAudit(deps, entry)` où `entry = { userId?: string | null, action: string, resourceType: string, resourceId?: string, memberId?: string, ip?: string, metadata?: Json }` → insère une ligne `AuditLog`. **Jamais** d'update/delete (append-only ; le trigger le garantit en base). Conventions `action` : verbes stables en MAJ (`MEMBER_READ`, `MEMBER_CREATE`, `MEMBER_UPDATE`, `CONSENT_CHANGE`, `MEMBER_EXPORT`, `MEMBER_ANONYMIZE`, `CONTRIBUTION_RECONCILE`…). `userId` = acteur (session), `memberId` = personne concernée si donnée personnelle. Injectable/testable (le service reçoit le repo).
- **Route** `GET /audit` (RBAC `auditLog`, `read`) — liste **paginée** (`limit`/`offset`, défaut raisonnable), tri `createdAt` **desc**, filtres optionnels : `memberId`, `resourceType`, `action`, `from`/`to` (dates). Réponse `{ entries: AuditEntryView[], total, limit, offset }`. `AuditEntryView` = miroir sérialisé (dates ISO) ; ne divulgue pas de secret (`metadata` maîtrisée par l'appelant).
- **Sécurité** : deny-by-default (RBAC) ; seuls `admin` et `rgpd` lisent l'audit (matrice §3.5). L'IP est renseignée par les appelants depuis `request.ip`.
- Schéma Zod local (`auditListQuery`) pour la query.

## Definition of Done
- [ ] Tests d'intégration (repo audit en mémoire) : `recordAudit` insère une entrée ; `GET /audit` pagine + filtre par `memberId`/`resourceType`/`action`/plage de dates, tri desc ; RBAC (200 pour `admin`/`rgpd`, 403 pour `brasseur`/`caisse`)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une action sensible enregistrée via `recordAudit` est relisible via `GET /audit` par un `admin`/`rgpd`, filtrable par membre

## Dépendances
Bloqué par : {{M1-01}}, {{M6-02}} — Bloque : {{M6-04}}, {{M6-05}}, {{M6-06}}, {{M6-08}}, {{M6-10}}
