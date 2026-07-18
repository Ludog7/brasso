---
labels: feature, P0
milestone: M9 — Boucle brassin complète
epic: true
---
# M9 — Boucle brassin complète (epic)

## Contexte
Premier milestone du **dev step 2** (SPEC-ORCHESTRATION §9, brief `docs/briefs/DEV-STEP-2.md` §3.A, décision D1). Le premier test d'usage réel a mis au jour un manque structurant : le cycle de vie d'un brassin **s'arrête à l'ensemencement**. `mapStep` (`packages/core/src/stateMachine/buildPlan.ts:244`) ignore explicitement `WHIRLPOOL`, `STABILIZE`, `CONDITION` et `PACKAGE` ; il n'existe donc ni suivi de fermentation, ni conditionnement quantifié, ni **stock de produits finis**. Deux bugs bloquants s'y ajoutent : les étapes sans timer (filtration) n'offrent aucun moyen d'avancer, et la validation du refroidissement ne fait pas passer à l'étape suivante.

Conséquence en cascade : sans produits finis, les cartes du bar ne peuvent proposer que des fournitures, et le tableau de bord n'a aucune matière à afficher. C'est la raison pour laquelle ce milestone est **prioritaire** sur tout le reste du lot.

## Objectif
Étendre le cycle du brassin **au-delà du Jour J** — fermentation, dry hop, cold crash, garde, conditionnement — et faire du conditionnement la source du **stock de produits finis**, immédiatement vendable et affichable.

## Critère de démo
**D'une recette publiée jusqu'au stock, sans rupture** : planifier un brassin, dérouler le Jour J complet (avec whirlpool, assainissement du circuit de refroidissement, validation manuelle des étapes sans timer et alertes de houblonnage), saisir à l'ensemencement les durées prévisionnelles, retrouver le brassin et ses échéances dans la nouvelle vue « Brassins », puis le conditionner en saisissant les quantités par contenant — et **constater que le stock de produits finis est incrémenté** et que l'article est vendable via le hub caisse et affichable sur un écran.

## Sous-tickets
{{CHECKLIST}}

## Ordre d'exécution
Le graphe de dépendances a été résolu : **l'ordre numérique M9-01 → M9-14 est un ordre d'exécution valide**. On peut donc dérouler les tickets dans l'ordre, sans arbitrage à chaque étape.

| Vague | Tickets | Pourquoi ici |
|---|---|---|
| 1 — fondations | M9-01, M9-02 | Sans dépendance. Les formules (§13) et la migration conditionnent tout le reste. |
| 2 — cœur métier pur | M9-03, M9-04, M9-05, M9-06 | `core` : state machine, alertes, jalons, volumes. Testés isolément, à 100 %. |
| 3 — serveur | M9-07, M9-08, M9-09 | Persistance et exposition. **M9-08 est la pièce maîtresse** (conditionnement → produits finis). |
| 4 — interface | M9-10, M9-11, M9-12, M9-13 | Écrans. M9-10 en premier : il porte la navigation dont les suivants dépendent. |
| 5 — vérification | M9-14 | E2E prouvant le critère de démo de bout en bout. |

Deux tickets peuvent être menés **en parallèle** si besoin : M9-04 (alertes de houblonnage) est indépendant de M9-05/M9-06, et M9-09 (liste des brassins) l'est de M9-08 (conditionnement).

## Dépendances
Bloqué par : la validation du go-live M8. S'appuie sur M1 (`core`, state machine pure), M3 (batchs, `recipeSnapshot`, profils d'équipement), M4 (Jour J, file offline), M5 (stock, mouvements append-only), M7 (hub caisse, écrans).
Bloque : **M11** (cartes du bar — §3.I dépend des produits finis) et **M13** (tableau de bord — tuiles « brassins en cours », « volume brassé », « stock produits finis »).

**Ne dépend d'aucun ADR nouveau** : les routes `batches` déclarent déjà la ressource RBAC `recettes` et le stock produits finis relève de `stocks` — M9 est donc démarrable immédiatement, sans attendre l'ADR-12 de M10.

## Points de vigilance
- **`recipeSnapshot` est immuable** (ADR-07) : les brassins déjà planifiés ne porteront jamais les nouveaux champs. Toute nouvelle étape doit être **dérivée** du snapshot, jamais exigée de lui — lecture défensive systématique.
- **ADR-11** : l'assainissement du circuit de refroidissement est un **indicateur d'aide à la décision**, jamais une garantie de stérilité.
- **Miroir enums** `core` ↔ Prisma sur `DayPhase` et `CatalogKind` (valeurs recopiées, pas d'import — ADR-03/04).
- Cadence **checkpoint + feu vert après chaque ticket**.
