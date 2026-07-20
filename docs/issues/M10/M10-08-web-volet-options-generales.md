---
labels: web, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-08 — web : volet « Options générales » (Apparence, Accès, Services, Templates)

## Contexte
L'instance n'a aujourd'hui **aucun écran de configuration** : le nom de l'association, les réglages métier et l'identité visuelle ne se modifient pas depuis l'application. Ce ticket livre le volet « Options générales » qui les expose, sous la ressource RBAC **`options`** créée par ADR-12 ({{M10-01}}) — **read : les 4 rôles ; update : admin**.

SOURCE : SPEC-ORCHESTRATION §9.2 (Q9, Q11), §9.4 ; ADR-12 ; epic M10.

## Objectif
Un admin configure l'identité, les services et les gabarits depuis l'application ; les autres rôles **consultent** sans jamais se voir proposer une action qu'ils ne peuvent pas exécuter.

## Périmètre technique
- `apps/web/src/routes/options/` (pages) et `apps/web/src/features/options/` (logique), plus la tuile d'accès depuis le hub.
- Consomme les primitives de {{M10-07}} — **aucune primitive locale**.
- Hors périmètre : la **bascule clair/sombre** → {{M10-11}} ; le bandeau → {{M10-09}} ; toute **édition** de la matrice RBAC.

## Spécification

**A. Sous-volet Apparence.** Nom de la brasserie, logo (téléversement borné en format et taille, cf. {{M10-04}}), couleur de marque. ⚠️ La bascule clair/sombre **n'est pas ici** — elle est passée à {{M10-11}} par l'arbitrage du 2026-07-20. Ne pas l'ajouter « puisqu'on y est ».

**B. Sous-volet Accès — restitution, jamais édition.** Le point à ne pas rater. §9.2 Q9 a tranché : ce sous-volet **affiche** qui peut quoi, par rôle, en lecture. Il **n'édite pas** la matrice.

Trois motifs qui justifient de ne pas laisser l'UI suggérer le contraire : déplacer la source de vérité en base détruirait la garantie typée ; un admin pourrait **se retirer ses propres droits et verrouiller l'instance** ; aucun besoin fin n'est établi.

Conséquence concrète : **aucun contrôle de formulaire** — ni case à cocher grisée, ni bouton désactivé qui laisserait croire à une permission manquante. Un tableau en lecture, et une phrase disant que la matrice évolue par décision d'architecture. Une case grisée est une promesse d'édition future qu'on ne tiendra pas.

**Libellé du rôle `caisse`** : afficher « **Trésorier / Caisse** » (§9.2, tranché le 2026-07-18). ⚠️ **La clé reste `caisse`** — aucune migration, aucun changement de `Role.key`, aucun impact RBAC. Ne pas transformer un libellé en renommage de clé.

**C. Sous-volet Services.** Activation de la météo et coordonnées (Open-Meteo). Pour tout service à secret (SMTP), afficher un **indicateur « configuré / non configuré »** — la valeur n'est **jamais** exposée, elle vit en variable d'environnement (§9.2 Q7). Un service injoignable **se dégrade** sans bloquer le rendu (offline-first).

**D. Sous-volet Templates.** Sélection parmi l'enum **`DisplayTemplate` existant** (`LIST`/`TABLE`/`CARDS`) enrichi de l'injection de marque. **Aucun nouvel enum** (§9.2 Q11).

**E. Rôles en lecture seule.** Pour les 3 rôles non-admin, l'écran est **consultable** et les actions d'écriture **absentes** — pas désactivées. `apps/web/src/lib/rbac.ts` porte les gardes d'UI ; l'API reste l'autorité.

**F. Atteignabilité.** Le volet doit être **atteignable depuis le hub** (`HomePage`), avec la garde de visibilité adéquate. C'est le mode de défaillance récurrent du projet — #273/#274/#276 : du code juste, testé, qu'aucun écran n'atteignait. Le test de hub livré par #281 est le gabarit à étendre.

## Definition of Done
- [ ] Les 4 sous-volets sont livrés et **atteignables depuis le hub**, avec la garde de visibilité correcte
- [ ] Le sous-volet Accès **restitue** la matrice : **aucun contrôle de formulaire**, aucune case grisée ; la phrase d'explication est présente
- [ ] `caisse` s'affiche « **Trésorier / Caisse** » ; **`Role.key` inchangée**, aucune migration
- [ ] Écriture réservée à `admin` ; pour les autres rôles les actions sont **absentes**, pas désactivées
- [ ] Aucun secret affiché — **indicateur « configuré »** uniquement
- [ ] Un service injoignable **ne bloque aucun rendu**
- [ ] Templates : `DisplayTemplate` existant, **aucun nouvel enum**
- [ ] Les primitives de {{M10-07}} sont utilisées — **aucune primitive locale**
- [ ] Tests montés **par `App` et sa route**, couvrant les 4 rôles en présence et en absence
- [ ] Wording ADR-11 respecté sur tout écran d'indicateur
- [ ] Prettier passé sur **tous** les fichiers touchés ; CI verte

## Dépendances
Bloqué par : {{M10-05}} (API `options`), {{M10-07}} (primitives) — Bloque : rien
