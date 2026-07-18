---
labels: api, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-08 — api : conditionnement → stock de produits finis (BatchPackaging + mouvement de stock)

## Contexte
**Pièce maîtresse du milestone** (brief §3.A.5). Aujourd'hui un brassin peut passer en étape « conditionnement » mais **aucune quantité conditionnée n'est saisie par type de contenant** — il n'existe donc pas de stock de produits finis. Conséquence directe : les cartes du bar ne peuvent proposer que des fournitures (bouteilles, capsules) au lieu des boissons, et le tableau de bord n'a aucun stock à afficher.

L'arbitrage est acté en SPEC-ORCHESTRATION §9.2 (Q10) : les produits finis sont un **`CatalogKind.PRODUIT_FINI`** dans le module Stock existant, **pas** un store dédié — parce que `SkuMapping.catalogItemId` et `DisplayScreenItem.catalogItemId` pointent déjà sur `CatalogItem`. C'est ce choix qui fait qu'une bière conditionnée devient vendable et affichable **sans une ligne de code nouvelle** dans le pipeline M7.

SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.5, §3.I, §3.J ; SPEC-ORCHESTRATION §3.3, §3.6, §9.2 (Q10) ; `docs/FORMULES-BRASSICOLES.md` §13.3.

## Objectif
Enregistrer un conditionnement — quantités par type de contenant — crée ou incrémente l'article **produit fini** correspondant et écrit le mouvement de stock associé, dans une transaction unique.

## Périmètre technique
- Fichiers concernés : `apps/api/src/modules/batches/` (routes/service/repository de conditionnement) ; `apps/api/src/modules/stock/` (création d'article produit fini, mouvement) ; `packages/core/src/batchCycle/packaging.ts` (répartition en contenants, FORMULES §13.3) ; tests `apps/api/tests/` et `packages/core/test/`.
- Hors périmètre explicite : l'UI de saisie (M9-13) ; le mapping SKU vers un produit externe (existant M7, simplement rendu possible) ; les templates de cartes du bar (M11) ; la décrémentation sur vente (existante M7, **non modifiée**).

## Spécification

**A. Répartition en contenants (`core`).**
Implémenter les règles de FORMULES §13.3 : `nbUnités = floor(volumeDisponibleL / contenanceL)`, reste conservé et **jamais arrondi silencieusement**, répartition descendante quand plusieurs contenants sont servis depuis le même volume. Valeur de validation : 24 L en fûts de 20 L puis bouteilles de 0,75 L → **1 fût + 5 bouteilles, reste 0,25 L**. Cette fonction est une **aide à la saisie** (elle propose une répartition) : les quantités réellement enregistrées sont celles saisies par l'opérateur, jamais celles calculées.

**B. Route de conditionnement.**
`POST /batches/:id/packaging` — corps : liste de lignes `{ containerItemId, containerVolumeL, quantity }` + volume conditionné total constaté. Traitement, **dans une seule transaction** :

1. valider que le brassin est en `EN_CONDITIONNEMENT` (ou `EN_FERMENTATION` avec passage explicite) et non annulé ;
2. enregistrer la mesure de volume conditionné (`BatchMeasure` type `VOLUME`) ;
3. **créer ou retrouver** l'article `CatalogItem` de `kind = PRODUIT_FINI` du brassin — nommé depuis la recette et le numéro de brassin, `sourceBatchId` renseigné, `unit = UNIT` ;
4. écrire les lignes `BatchPackaging` ;
5. écrire le **mouvement de stock** `StockMovement(catalogItemId, delta = +quantité, reason: PRODUCTION, batchId, userId)` — registre **append-only**, jamais d'UPDATE ;
6. décrémenter le stock des **contenants consommés** (`CONDITIONNEMENT` : bouteilles, fûts, capsules) par un mouvement de motif `PRODUCTION` ;
7. faire passer le brassin en `TERMINE` et renseigner `packagedAt` / `completedAt`.

Tout échec en cours de séquence **annule l'ensemble** : jamais un stock incrémenté sans ligne de conditionnement, ni l'inverse.

**C. Un article produit fini par brassin.**
Choix à acter et documenter : l'unité de stock est le **brassin**, pas la recette — deux brassins d'une même recette donnent deux articles distincts. Motif : la traçabilité associative exige de savoir quel lot est vendu (rappel, DLU, écart de qualité) ; agréger par recette la détruirait. Le regroupement d'affichage par recette relève de l'UI (M11), pas du stock.

**D. Corrections.** Le registre étant append-only, une erreur de saisie se corrige par un **mouvement inverse** (`ADJUSTMENT`) accompagné d'une note, jamais par modification ou suppression. Exposer la route de correction correspondante et refuser explicitement toute tentative de mise à jour d'un mouvement.

**E. Bouteilles mécaniques réutilisables.** Le brief les cite explicitement (§3.J). Elles sont un contenant `CONDITIONNEMENT` comme un autre à ce stade ; leur **retour en stock** (consigne) n'est pas traité ici — le noter en commentaire comme extension possible plutôt que de l'improviser.

**F. RBAC.** Aucune ressource nouvelle : conditionner écrit du stock ⇒ `("stocks", "create")` pour les mouvements, `("recettes", "update")` pour la transition du brassin. Une route qui touche les deux domaines déclare le couple le **plus restrictif** et vérifie le second dans le service.

## Definition of Done
- [ ] Test core de la répartition en contenants contre la **valeur de référence** FORMULES §13.3 (1 fût + 5 bouteilles, reste 0,25 L) + cas limites (volume < contenance, contenance nulle, reste nul)
- [ ] Tests d'intégration API : conditionnement complet créant article produit fini + `BatchPackaging` + mouvements (produit fini **et** contenants consommés) + passage en `TERMINE`
- [ ] Test de **transactionnalité** : un échec en milieu de séquence ne laisse **aucune** écriture partielle
- [ ] Test d'idempotence/rejeu et test de correction par mouvement inverse ; tentative de modification d'un mouvement **refusée**
- [ ] Test RBAC : `caisse` et `rgpd` refusés en écriture
- [ ] Test d'intégration **transverse** : l'article produit fini créé est mappable via `SkuMapping` et sélectionnable dans un `DisplayScreenItem` — la preuve que le choix Q10 tient
- [ ] Couverture `core` 100 % maintenue ; lint + typecheck + CI verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : après conditionnement d'un brassin, le stock de produits finis affiche les quantités par contenant, et une vente les décrémente **via le pipeline M7 inchangé**

## Dépendances
Bloqué par : {{M9-01}} (FORMULES §13.3), {{M9-02}} (`BatchPackaging`, `CatalogKind.PRODUIT_FINI`), {{M9-07}} (transitions) — Bloque : {{M9-13}}, {{M9-14}}
