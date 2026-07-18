---
labels: core, bug, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-03 — core : state machine Jour J — étapes sans timer, sortie de refroidissement, whirlpool, assainissement du circuit

## Contexte
Le premier test d'usage réel a révélé **deux bugs bloquants** dans la state machine et **deux manques** (brief §3.A.2) :

1. **BUG** — sur une étape **sans timer** (filtration `LAUTER`), aucun bouton ne permet d'avancer : le brassage se retrouve coincé, l'opérateur n'ayant que « Forcer l'étape » (qui journalise à tort un écart de procédure alors que rien d'anormal ne s'est produit).
2. **BUG** — après **validation du refroidissement**, le passage à l'étape suivante ne se fait pas.
3. **MANQUE** — `WHIRLPOOL` est droppé par `mapStep` (`buildPlan.ts:244`) alors que `ProcessStepType.WHIRLPOOL` existe déjà côté recette : une étape décrite dans la recette disparaît silencieusement du Jour J.
4. **MANQUE** — l'**assainissement du circuit de refroidissement** (faire circuler le moût bouillant ~5 min avant le hors-flamme) n'existe pas.

`core` étant pur et testé à 100 % (ADR-03), la correction se fait ici en premier ; l'UI suit en M9-11. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.2 ; SPEC-ORCHESTRATION §9.4 ; ADR-08, ADR-11.

## Objectif
La state machine permet d'avancer sur **toute** étape (avec ou sans timer) sans journaliser d'écart abusif, enchaîne correctement après le refroidissement, intègre le whirlpool et propose l'assainissement du circuit — le tout dérivé défensivement de snapshots existants.

## Périmètre technique
- Fichiers concernés : `packages/core/src/stateMachine/` (`buildPlan.ts`, `types.ts`, `plan.ts`, transition / `initDayState` de M1-13) ; tests `packages/core/test/stateMachine/`.
- Hors périmètre explicite : l'UI (M9-11) ; les alertes de houblonnage (M9-04) ; les jalons post-ensemencement (M9-05) ; les prises de volume (M9-06) ; toute persistance.

## Spécification

**A. Validation manuelle des étapes sans timer (bug 1).**
Distinguer clairement deux notions aujourd'hui confondues :
- **avancer normalement** une étape qui n'a pas de condition temporelle à satisfaire — c'est une progression **nominale**, elle ne doit produire **aucun** `DeviationLog` ;
- **forcer** une étape dont les conditions ne sont pas remplies — comportement M4 existant, qui journalise un écart (et doit le rester).

Exposer sur chaque `StepSpec` de quoi trancher : une étape est **validable manuellement** dès lors qu'elle n'a ni `plannedHoldMin`, ni condition de stabilisation en attente, et que ses `requiredMeasurements` sont saisies. La transition correspondante (`VALIDATE_STEP` ou équivalent aligné sur le vocabulaire d'événements existant de M1-13) avance le curseur **sans écart**. Le contrat doit être explicite dans les types : ne pas laisser l'UI deviner par l'absence de champ.

**B. Sortie de refroidissement (bug 2).**
À la validation d'une étape `COOLING` dont la température mesurée atteint la cible, la transition doit **avancer** au jalon suivant (`PITCHING`). Si la température n'est pas atteinte, l'étape n'avance pas mais la mesure est **conservée** : consigner température **et** horodatage jusqu'à l'ensemencement, comme demandé au brief (« consigner températures + timing jusqu'à l'ensemencement »). Le refus d'avancer ne doit **jamais** perdre la saisie de l'opérateur.

**C. Réintégration de `WHIRLPOOL`.**
Ajouter la phase `WHIRLPOOL` au type `Phase` de `core`, mapper `ProcessStepType.WHIRLPOOL` dans `mapStep` (ids stables `whirlpool-1`, `whirlpool-2`…), positionnée **entre** `BOIL` et `COOLING`. Étendre `phaseToDayPhase` vers la valeur Prisma `WHIRLPOOL` ajoutée en M9-02. Paramètres lus défensivement depuis `params` : durée (`timeMin`) et température (`tempC`) si présentes. `requiresStabilization: false` (le whirlpool n'attend pas une consigne de chauffe), `plannedHoldMin` si une durée est déclarée.

**D. Assainissement du circuit de refroidissement — étape DÉRIVÉE.**
Point d'architecture important : `recipeSnapshot` est **immuable** (ADR-07). Les brassins déjà planifiés ne porteront jamais une étape « assainissement », et modifier les recettes n'y changerait rien. L'étape doit donc être **dérivée par `buildDayPlan`**, jamais attendue du snapshot :

- Condition de génération : le plan comporte une étape `BOIL` avec une durée connue **et** au moins une étape de refroidissement (`COOL`) — s'il n'y a pas de circuit à assainir, on n'invente pas l'étape.
- Placement : dans la phase `BOIL`, déclenchée `coolingCircuitSanitizeLeadMin` minutes **avant la fin** de l'ébullition (défaut 5, paramétrable — cf. `Settings`, M9-02). Le délai est une **entrée** de `buildDayPlan`, pas une constante codée en dur dans `core`.
- Si la durée d'ébullition est inférieure au délai, l'étape est placée au début de l'ébullition plutôt que d'être omise ou de produire un temps négatif.
- Identifiant stable : `boil-sanitize-1`.

> **ADR-11 — wording imposé.** Cette étape est un **indicateur d'aide à la décision**, jamais une garantie sanitaire. Le libellé et toute chaîne exportée par `core` disent « assainissement du circuit », **jamais** « stérilisation », « stérile », « conforme » ni « sûr ». Le disclaimer alimentaire s'applique à l'écran qui la porte (M9-11).

**E. Rétro-compatibilité.** `buildDayPlan` doit continuer à produire un plan valide pour un snapshot **antérieur** à M9 (aucun whirlpool, aucune donnée nouvelle) : les ajouts sont dérivés ou optionnels, jamais requis. Toute lecture reste défensive (`finiteNumber`, champs absents ignorés, aucune exception).

## Definition of Done
- [ ] Tests core (Vitest) couvrant : validation manuelle d'une étape sans timer **sans** `DeviationLog` ; refus de forcer confondu avec la validation nominale (test de non-régression) ; sortie de `COOLING` à température atteinte **et** conservation de la mesure quand elle ne l'est pas ; mapping `WHIRLPOOL` avec ids stables et ordre `BOIL → WHIRLPOOL → COOLING` ; dérivation de l'assainissement (présent avec `BOIL`+`COOL`, **absent** sans `COOL`, placé au bon offset, borné quand l'ébullition est plus courte que le délai)
- [ ] Test de **rétro-compatibilité** : un snapshot pré-M9 produit toujours un plan valide
- [ ] Scan ADR-11 : aucune chaîne exportée ne contient `/stéril/i`, `/conforme/i` ni `/\bsûre?\b/i`
- [ ] Couverture `core` **100 %** maintenue (gate CI)
- [ ] Lint + typecheck + CI verts ; Prettier passé sur tous les fichiers touchés
- [ ] Critère observable : `buildDayPlan` d'une recette avec whirlpool et refroidissement produit `INITIALISATION → MASH… → LAUTER → BOIL → boil-sanitize-1 → WHIRLPOOL → COOLING → PITCHING`

## Dépendances
Bloqué par : {{M9-02}} (enum `DayPhase.WHIRLPOOL`, `Settings.coolingCircuitSanitizeLeadMin`) — Bloque : {{M9-07}}, {{M9-11}}, {{M9-14}}
