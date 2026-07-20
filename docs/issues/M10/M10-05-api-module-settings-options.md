---
labels: api, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-05 — api : module `settings` — options générales sous la ressource RBAC `options`

## Contexte
Le volet « Options générales » a besoin d'une API de lecture/écriture. Le point délicat n'est pas le CRUD, c'est **qui a le droit de lire quoi**.

`parametres` valait `admin: CRUD` et **rien** pour les trois autres rôles. Tel quel, un brasseur ne pouvait pas lire le nom, le logo ni la couleur de marque — et le critère de démo M10 (« identité appliquée à tout l'écran ») aurait été inatteignable pour 3 rôles sur 4.

**Arbitrage de Ludo du 2026-07-20**, acté par ADR-12 ({{M10-01}}) : `parametres` est **scindé**. `parametres` conserve l'administration des comptes (**admin CRUD**, inchangé) ; une ressource **`options`** est créée — **read : les 4 rôles ; update : admin**. Ouvrir la lecture sur la ressource d'origine aurait exposé la liste des utilisateurs par effet de bord.

SOURCE : ADR-12 ; SPEC-ORCHESTRATION §3.5, §9.2 (Q9), §9.4.

## Objectif
Les options générales se lisent par tout utilisateur authentifié et ne s'écrivent que par un admin ; un sous-ensemble **strictement borné** est lisible **avant authentification** pour l'écran de connexion.

## Périmètre technique
- `apps/api/src/modules/settings/` : `schema.ts` (Zod, importé de `@brasso/core`) → `routes.ts` → `service.ts` → `repository.ts`, selon le patron de module en vigueur.
- `apps/api/src/rbac/matrix.ts` : **encodage de la ressource `options`** décidée par ADR-12. C'est le seul endroit où le contrôle d'accès se résout.
- Schémas Zod dans `packages/core/src/schemas/` (ADR-04).
- Hors périmètre : la bascule PIN ({{M10-06}}), toute UI, et l'édition de la matrice — le sous-volet « Accès » **restitue**, il n'édite pas.

## Spécification

**A. Encodage de la matrice.** Ajouter `options` aux `RESOURCES` et sa ligne à `RBAC_MATRIX`, **exactement** comme l'ADR la fixe. Ne pas toucher à la ligne `parametres`. Le commentaire-tableau en tête de `matrix.ts` reproduit la §3.5 pour relecture directe : le tenir à jour, sinon il ment.

**B. Lecture publique — le point sensible.** ADR-12 autorise l'écran de connexion à afficher **nom, logo et couleur de marque**, et **rien d'autre**. Contraintes à tenir :

- La route publique renvoie **exactement ces trois champs**, en liste blanche **explicite** dans le code. **Jamais** un objet `Settings` filtré par omission : un champ ajouté demain fuiterait tout seul. C'est la différence entre « je choisis ce qui sort » et « j'espère avoir pensé à tout retirer ».
- **Read-only**, non authentifiée, et **non divulgante** : elle ne doit révéler ni l'existence de comptes, ni l'état d'installation de l'instance. Une instance non configurée renvoie des valeurs neutres, pas une erreur qui trahirait qu'elle est vierge.
- Poser un **rate-limit** : c'est une route non authentifiée.

**C. Écriture.** `update` réservé à `admin`. Validation Zod stricte : couleur de marque hexadécimale, coordonnées bornées, chemin de logo contraint. Rejet **explicite** de tout champ inconnu plutôt qu'ignoré en silence.

**D. Aucun secret.** Les identifiants SMTP et assimilés vivent en **variables d'environnement** (§9.2 Q7). L'API ne doit ni les lire depuis la base, ni les y écrire, ni les renvoyer. Si un réglage de service a besoin d'un indicateur, il expose un **booléen « configuré »**, jamais la valeur.

**E. Journalisation.** Une modification des options est un acte d'administration : elle est **auditée** (ressource `auditLog`), avec l'auteur et le champ modifié — pas la valeur si elle est sensible.

## Definition of Done
- [ ] Ressource `options` encodée dans `matrix.ts` **conformément à ADR-12** ; ligne `parametres` **inchangée** ; commentaire-tableau à jour
- [ ] Toute route déclare son couple `(ressource, action)` — deny-by-default préservé
- [ ] Tests d'autorisation **et de refus** pour les 4 rôles, en lecture comme en écriture
- [ ] La route publique renvoie les **trois** champs par **liste blanche explicite** — test le prouvant, y compris après ajout d'un champ à `Settings`
- [ ] La route publique est **non divulgante** sur une instance vierge, et **rate-limitée**
- [ ] Écriture réservée à `admin` ; champs inconnus **rejetés**, non ignorés
- [ ] **Aucun secret** lu, écrit ou renvoyé ; indicateur « configuré » uniquement
- [ ] Modification des options **auditée**
- [ ] Schémas Zod dans `core` ; couverture ≥ 90 % si `packages/core` est touché
- [ ] Prettier passé sur **tous** les fichiers touchés ; CI verte

## Dépendances
Bloqué par : {{M10-01}} (ADR-12), {{M10-04}} (colonnes) — Bloque : {{M10-08}}, {{M10-09}}
