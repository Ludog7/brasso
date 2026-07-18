---
labels: web, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-13 — web : écran de conditionnement (quantités par contenant → stock de produits finis)

## Contexte
Volet UI de la pièce maîtresse du milestone ({{M9-08}}). Aujourd'hui le passage en étape conditionnement n'ouvre **aucune saisie** : le brief (§3.A.5) demande de saisir les **quantités par type de contenant** — bouteilles, fûts, bouteilles mécaniques réutilisables — afin de générer le stock de produits finis, qui deviendra l'article vendable des cartes du bar (§3.I).

C'est l'écran qui referme la boucle « recette → brassin → stock ». SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.5, §3.I, §3.J ; `docs/FORMULES-BRASSICOLES.md` §13.3.

## Objectif
Un écran de conditionnement permet de saisir le volume conditionné et sa répartition en contenants, et d'en constater immédiatement l'effet sur le stock de produits finis.

## Périmètre technique
- Fichiers concernés : `apps/web/src/features/batches/` (écran de conditionnement) ; `apps/web/src/features/stock/` (affichage de la famille produits finis) ; tests `apps/web/src/test/`.
- Hors périmètre explicite : la transaction serveur ({{M9-08}}) ; le mapping SKU (M7, existant) ; les cartes du bar et leurs templates (M11) ; les familles et la recherche de stock (M11).

## Spécification

**A. Saisie du volume conditionné.** Champ de volume réellement conditionné (litres, unité interne), avec rappel du volume ensemencé et du **rendement de conditionnement** calculé en direct ({{M9-06}}). Un rendement supérieur à 100 % est physiquement impossible : le signaler comme **avertissement de saisie**, sans bloquer ni effacer la valeur (l'opérateur peut avoir mesuré autrement).

**B. Répartition en contenants.** Lignes `{ contenant, contenance, quantité }`, le contenant étant choisi parmi les articles de catalogue `CONDITIONNEMENT` (seedés en {{M9-02}}). Proposer une **répartition suggérée** depuis la fonction `core` ({{M9-08}}, FORMULES §13.3) — grands contenants d'abord, reste affiché — présentée clairement comme une **proposition modifiable** : les quantités enregistrées sont toujours celles saisies par l'opérateur. Afficher en continu le volume réparti, le **reste** non conditionné et l'écart au volume saisi.

**C. Recherche de contenant.** Le brief signale (§3.J) qu'il est difficile de retrouver un article à l'ajout : prévoir dès ici un **champ de recherche** sur le sélecteur de contenant, plutôt qu'une liste déroulante longue. Le traitement général de la recherche de stock relève de M11 ; ce sélecteur ne doit pas devenir un composant concurrent — préférer une primitive réutilisable.

**D. Contrôle des stocks de contenants.** Si la quantité saisie dépasse le stock disponible de bouteilles ou de fûts, **avertir sans bloquer** : le stock déclaratif peut être en retard sur la réalité de l'atelier, et bloquer un conditionnement en cours serait pire que le laisser passer. Le mouvement de stock reste écrit ({{M9-08}}) et l'écart sera régularisé par inventaire.

**E. Confirmation et effet.** À la validation, afficher un récapitulatif explicite avant écriture (l'opération est **irréversible** au sens du registre append-only : une erreur se corrige par un mouvement inverse, pas par une modification). Après écriture, montrer l'article **produit fini** créé, ses quantités par contenant, et le passage du brassin en `TERMINE`.

**F. États et responsive.** États vides / chargement / erreur soignés ; cibles ≥ 48 px, aucune saisie critique masquée en largeur réduite (§4, §6).

## Definition of Done
- [ ] Tests web : saisie du volume et rendement calculé en direct ; avertissement au-delà de 100 % **sans** blocage ; répartition suggérée puis **modifiée** par l'opérateur (les quantités envoyées sont bien les saisies) ; reste affiché ; recherche de contenant ; avertissement de stock insuffisant non bloquant ; récapitulatif avant validation ; affichage du produit fini créé et du passage en `TERMINE`
- [ ] Test d'inspection de la requête émise : lignes de conditionnement et volume conformes à la saisie
- [ ] Test des états vide / chargement / erreur
- [ ] Ergonomie atelier : cibles ≥ 48 px, aucun scroll horizontal en largeur réduite
- [ ] `pnpm --filter @brasso/web {typecheck,lint,test,build}` verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : conditionner un brassin fait apparaître la boisson dans le stock de produits finis, prête à être vendue et affichée

## Dépendances
Bloqué par : {{M9-06}}, {{M9-08}}, {{M9-10}} — Bloque : {{M9-14}}
