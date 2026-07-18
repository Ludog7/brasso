---
labels: core, feature, P1
milestone: M9 — Boucle brassin complète
---
# M9-06 — core : chaîne des volumes du brassin, volume final et rendement de conditionnement

## Contexte
Le brief (§3.A.4) relève qu'il **manque les volumes en fin de brassin** : il faut des prises de volume sur les étapes clés et un **volume final produit**, qui alimente à la fois le rendement du brassin et le stock de produits finis. Aujourd'hui `buildPlan` ne pose `requiredMeasurements: ["density","volume"]` que sur `LAUTER` (`buildPlan.ts:149`) — le reste du brassin n'exige aucune mesure de volume, si bien qu'un brassin terminé ne sait pas combien il a produit.

C'est la brique qui rend le conditionnement (M9-08) quantifiable et le rendement affichable. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.4 ; `docs/FORMULES-BRASSICOLES.md` **§13.2** (livrée par {{M9-01}}) ; §9.1 (rendement réel, à ne pas confondre).

## Objectif
`core` expose la chaîne des volumes du brassin et le rendement de conditionnement, et le plan Jour J exige une prise de volume aux étapes clés — validés contre les valeurs de référence de FORMULES §13.2.

## Périmètre technique
- Fichiers concernés : `packages/core/src/batchCycle/volumes.ts` (module créé en M9-05) ; `packages/core/src/stateMachine/buildPlan.ts` (extension des `requiredMeasurements`) ; tests `packages/core/test/batchCycle/` et `packages/core/test/stateMachine/`.
- Hors périmètre explicite : la saisie et la persistance des mesures (M9-07, M9-13) ; le coût de revient (livré en M5, non modifié) ; le calcul d'IBU/OG (M1, non modifié).

## Spécification

**A. Prises de volume aux étapes clés.**
Étendre `requiredMeasurements` du plan Jour J pour exiger une mesure de **volume** aux étapes qui en portent une réellement observable :
- `LAUTER` — volume pré-ébullition (**déjà en place**, ne pas régresser) ;
- fin de `BOIL` — volume post-ébullition ;
- `PITCHING` — volume ensemencé (déjà exploité par l'ajustement de stock M5 : vérifier la cohérence plutôt que de dupliquer la notion).

Le **volume conditionné** n'est **pas** une mesure du Jour J : il est saisi au conditionnement, bien après (M9-13). Ne pas le forcer dans le plan Jour J.

> ⚠️ **Rétro-compatibilité** : ajouter une mesure requise à une étape rend potentiellement bloquant un brassin déjà en cours au moment du déploiement. Vérifier explicitement qu'un brassin dont l'étape est déjà engagée n'est pas coincé — au besoin, la mesure est requise pour la **validation nominale** mais reste contournable par le mécanisme « forcer l'étape » existant, qui journalise l'écart. Ce point doit être testé, pas supposé.

**B. Chaîne des volumes.**
Implémenter la succession décrite en FORMULES §13.2 (pré-ébullition → post-ébullition → transféré → ensemencé → conditionné), en réutilisant les paramètres d'équipement **existants** (`deadspaceL`, `transferLossL`, `evaporationRateLPerHour`) — aucun paramètre nouveau, aucune formule réécrite de mémoire. Chaque volume peut être soit **mesuré** (il prime toujours), soit **estimé** depuis le précédent et les pertes. Distinguer les deux dans la sortie : un volume mesuré et un volume estimé ne se valent pas et l'UI doit pouvoir le dire.

**C. Rendement de conditionnement.**

```
rendementConditionnement (%) = 100 × volumeConditionné / volumePréÉbullition
```

À ne **pas** confondre avec `realEfficiency` (§9.1), qui porte sur l'extraction des sucres : le commenter explicitement pour éviter la confusion en relecture. Cas limites : volume pré-ébullition nul ou absent ⇒ résultat `null` (pas une division par zéro, pas une exception) ; rendement > 100 % ⇒ valeur retournée **assortie d'un avertissement** (c'est physiquement impossible, donc le signe d'une saisie erronée — on le signale sans masquer la donnée).

**D. Unités.** Litres partout (unité interne). Toute conversion éventuelle passe **exclusivement** par `packages/core/src/units.ts` (`CLAUDE.md`) — aucune conversion locale.

## Definition of Done
- [ ] Tests core validant les **valeurs de référence** de FORMULES §13.2 (30 L pré-ébullition → 24 L conditionnés = **80 %**)
- [ ] Tests des cas limites : volume pré-ébullition nul/absent → `null` sans exception ; rendement > 100 % → avertissement ; volume mesuré prioritaire sur volume estimé
- [ ] Test de **non-blocage** : un brassin engagé avant l'ajout des mesures requises reste avançable (nominalement ou par « forcer l'étape »)
- [ ] Test de non-régression : `LAUTER` exige toujours densité **et** volume
- [ ] Aucune conversion d'unité hors de `units.ts`
- [ ] Couverture `core` **100 %** maintenue ; lint + typecheck + CI verts ; Prettier passé sur tous les fichiers touchés
- [ ] Critère observable : depuis les mesures d'un brassin, `core` restitue la chaîne complète des volumes et le rendement de conditionnement

## Dépendances
Bloqué par : {{M9-01}} (FORMULES §13.2), {{M9-02}} (commentaire `BatchMeasure`), {{M9-03}} (structure du plan) — Bloque : {{M9-07}}, {{M9-13}}
