---
labels: web, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-12 — web : fin d'ensemencement — saisie des durées prévisionnelles et jalons datés

## Contexte
Le brief (§3.A.3) demande qu'à la **validation de l'ensemencement**, l'opérateur saisisse les durées prévues — fermentation, **dry hop si la recette en comporte**, cold crash, garde (défaut **21 j**, ajustable) — et que les dates correspondantes soient calculées et poussées vers l'agenda interne. C'est le moment charnière du cycle : le brassin quitte le Jour J et entre dans une phase longue qui, aujourd'hui, n'est ni datée ni suivie.

Le calcul est déjà livré ({{M9-05}}) et persisté ({{M9-07}}) : ce ticket porte la saisie et la restitution. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.3, §3.M ; SPEC-ORCHESTRATION §9.2 (Q4).

## Objectif
La validation de l'ensemencement ouvre la saisie des durées prévisionnelles, pré-remplies par les défauts, et matérialise immédiatement les jalons datés du brassin.

## Périmètre technique
- Fichiers concernés : `apps/web/src/features/day/` (fin de parcours Jour J) ; `apps/web/src/features/batches/` (frise des jalons, partagée avec {{M9-10}}) ; tests `apps/web/src/test/`.
- Hors périmètre explicite : le calcul des dates (`core`, {{M9-05}}) ; la persistance (`api`, {{M9-07}}) ; l'agenda et ses exports (M13) ; le conditionnement (M9-13).

## Spécification

**A. Déclenchement.** À la validation de l'étape d'ensemencement, présenter la saisie des durées **avant** de clore le Jour J. Elle doit être franchissable : un opérateur pressé peut accepter les valeurs par défaut en une action, sans être bloqué en fin de brassage — c'est un moment où l'atelier est en train de ranger.

**B. Champs et défauts.** Quatre durées en **jours entiers**, pré-remplies depuis `Settings` ({{M9-02}}) : fermentation (14), dry hop (3), cold crash (2), garde (**21**). Toutes ajustables, bornées `[0, 365]` avec message de validation clair. Une durée à **0 supprime le jalon** — le dire explicitement dans l'UI, sinon le comportement paraîtra être un bug.

**C. Dry hop conditionnel.** Le champ dry hop n'apparaît **que si la recette en comporte un**, déterminé par le helper de `core` ({{M9-05}}) lisant le `recipeSnapshot` — surtout pas par une analyse refaite côté front. Absent, la séquence se referme sans trou.

**D. Restitution immédiate.** Dès la saisie, afficher les **dates calculées** de chaque jalon et la **date de fin prévue** du brassin, mises à jour en direct à chaque modification de durée. C'est le retour qui donne confiance dans la saisie — et le pendant direct du défaut de réactivité reproché à l'éditeur de recettes (§3.D).

**E. Modification ultérieure.** Les durées restent ajustables depuis le détail du brassin ({{M9-10}}) tant que le jalon concerné n'est pas achevé. Un jalon achevé n'est **pas** réécrit par un changement de prévision ({{M9-07}}) : l'UI doit le montrer comme figé plutôt que d'offrir une action qui échouera côté serveur.

**F. Offline.** La saisie intervient en fin de Jour J, potentiellement hors ligne : elle passe par la **file d'actions offline** existante et se rejoue à la reconnexion, sans perte (ADR-08).

## Definition of Done
- [ ] Tests web : pré-remplissage depuis `Settings` ; recalcul en direct des dates à chaque changement de durée ; **apparition conditionnelle** du champ dry hop (présent et absent) ; durée 0 supprimant le jalon ; bornes rejetées avec message ; validation en une action avec les défauts
- [ ] Test : un jalon achevé est présenté comme figé et non modifiable
- [ ] Test **offline** : saisie hors ligne mise en file et rejouée à la reconnexion
- [ ] Aucun calcul de date côté front — délégation à `@brasso/core` vérifiée en revue
- [ ] Ergonomie atelier : cibles ≥ 48 px, saisie numérique adaptée au tactile
- [ ] `pnpm --filter @brasso/web {typecheck,lint,test,build}` verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : à la fin d'un Jour J, le brassin affiche sa frise de jalons datés et sa date de fin prévue

## Dépendances
Bloqué par : {{M9-05}}, {{M9-07}}, {{M9-10}}, {{M9-11}} — Bloque : {{M9-14}}
