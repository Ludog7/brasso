---
labels: core, feature, P1
milestone: M9 — Boucle brassin complète
---
# M9-04 — core : alertes de houblonnage (amérisant, aromatique, hors-flamme) pendant l'ébullition

## Contexte
Le brief (§3.A.2) demande de **fiabiliser et couvrir de tests** les alertes d'ajout de houblon pendant l'ébullition : ajouts amérisants, ajouts aromatiques et **hors-flamme** (flame-out). Ce point n'a pas pu être testé lors de la session d'usage réel faute de temps — il est donc traité ici comme un comportement à spécifier et à verrouiller par des tests, pas comme un simple correctif.

L'enjeu est concret : rater un ajout à 15 min ou le hors-flamme dégrade directement l'amertume et l'aromatique du brassin. Les données nécessaires existent déjà dans le snapshot — `RecipeIngredient` porte `use` (`BOIL`, `FIRST_WORT`, `WHIRLPOOL`, `DRY_HOP`…) et un temps d'ajout — mais le plan Jour J ne les expose pas. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.2 ; `docs/FORMULES-BRASSICOLES.md` §4.3 (règles par type d'ajout) ; ADR-08.

## Objectif
`buildDayPlan` expose, pour la phase d'ébullition, la liste ordonnée et horodatée des ajouts de houblon à réaliser — y compris le hors-flamme — de sorte que l'UI puisse alerter au bon moment sans redécouvrir la recette.

## Périmètre technique
- Fichiers concernés : `packages/core/src/stateMachine/` (`buildPlan.ts`, `types.ts`) ; tests `packages/core/test/stateMachine/`.
- Hors périmètre explicite : le déclenchement sonore/visuel et la file offline (M9-11) ; le calcul d'IBU (déjà livré en M1, non modifié ici) ; les ajouts en fermentation (`DRY_HOP` — relève des jalons, M9-05).

## Spécification

**A. Extraction des ajouts depuis le snapshot.**
Lire défensivement `ingredients` du `recipeSnapshot` et retenir ceux de catégorie `HOP`. Pour chacun : nom, quantité (g, unité interne), `use` et temps d'ajout déclaré. Toute ligne inexploitable (catégorie absente, temps non numérique) est **ignorée sans exception**, conformément au contrat de lecture défensive du snapshot.

**B. Classement des ajouts.** Trois natures à distinguer, alignées sur les conventions de `FORMULES-BRASSICOLES.md` §4.3 :

| Nature | Origine | Moment |
|---|---|---|
| **Amérisant** | `use = BOIL` avec temps restant élevé, et `FIRST_WORT` | tôt dans l'ébullition |
| **Aromatique** | `use = BOIL` avec temps restant court | fin d'ébullition |
| **Hors-flamme** | `use = BOIL` à temps restant **0**, et `use = WHIRLPOOL` | à l'extinction / au whirlpool |

Le seuil séparant amérisant et aromatique est un **paramètre d'entrée avec une valeur par défaut documentée**, pas une constante magique enfouie : un ajout est aromatique en deçà de ~20 min de temps restant. Documenter ce choix en commentaire avec son motif (au-delà, l'isomérisation domine ; en deçà, l'aromatique est préservé) et le rendre ajustable.

**C. Conversion en échéances.** Les recettes expriment un houblonnage en **temps restant** avant la fin d'ébullition, alors qu'un timer Jour J compte en **temps écoulé**. Exposer les deux pour éviter que chaque consommateur refasse la soustraction (source classique d'erreur d'un facteur inversé) :

```
offsetDepuisDébutMin = duréeÉbullitionMin − tempsRestantMin
```

Un ajout dont le temps restant excède la durée d'ébullition est **borné à 0** (début d'ébullition) et signalé comme incohérent plutôt que de produire un offset négatif. Les ajouts sont retournés **triés par offset croissant**, à égalité par nom, pour un ordre stable et testable.

**D. Rattachement au plan.** Attacher ces échéances à la `StepSpec` de la phase `BOIL` (et, pour les ajouts `WHIRLPOOL`, à l'étape whirlpool livrée en M9-03). Le hors-flamme est explicitement identifiable : c'est lui que l'UI doit alerter à l'extinction du feu, distinctement du dernier ajout aromatique.

**E. Pureté.** Aucune horloge, aucune notion de « maintenant » dans `core` : on produit des **offsets relatifs**, l'ancrage temporel est fait par l'appelant (ADR-03/ADR-08, le serveur restant autoritaire sur les horodatages).

## Definition of Done
- [ ] Tests core couvrant : extraction et classement des trois natures d'ajout ; conversion temps restant → offset (dont le cas `restant > durée` borné à 0 et signalé) ; tri stable ; ajouts `WHIRLPOOL` rattachés à l'étape whirlpool ; hors-flamme distinguable du dernier aromatique ; ingrédient non-houblon ignoré ; snapshot sans houblon → liste vide sans erreur
- [ ] Test de **rétro-compatibilité** sur un snapshot pré-M9
- [ ] Couverture `core` **100 %** maintenue
- [ ] Aucune constante de seuil codée en dur sans commentaire justificatif ni possibilité de réglage
- [ ] Lint + typecheck + CI verts ; Prettier passé sur tous les fichiers touchés
- [ ] Critère observable : pour une recette à 60 min d'ébullition avec ajouts à 60, 15 et 0 min restants, le plan expose trois échéances aux offsets 0, 45 et 60 min, classées amérisant / aromatique / hors-flamme

## Dépendances
Bloqué par : {{M9-03}} (phase `WHIRLPOOL` et structure du plan) — Bloque : {{M9-11}}
