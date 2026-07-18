---
labels: core, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-05 — core : jalons datés du cycle post-ensemencement (fermentation, dry hop, cold crash, garde)

## Contexte
Aujourd'hui le brassin « disparaît » après l'ensemencement : aucune date prévisionnelle, aucune échéance, rien à afficher dans une vue de suivi ni dans un agenda. Le brief (§3.A.3) demande qu'à la validation de l'ensemencement, l'opérateur saisisse les **durées prévues** — fermentation, dry hop (si la recette en comporte), cold crash, garde (défaut **21 j**, ajustable) — et que les **dates correspondantes** soient calculées puis exposées à l'agenda interne (§3.M).

Le calcul est déterministe et sans dépendance : il vit donc dans `core` (ADR-03), conformément aux règles écrites en M9-01. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.3 ; `docs/FORMULES-BRASSICOLES.md` **§13.1** (livrée par {{M9-01}}) ; SPEC-ORCHESTRATION §9.2 (Q4).

## Objectif
`core` expose une fonction pure qui, depuis une date d'ensemencement et un jeu de durées, produit la séquence complète des jalons datés du brassin, validée contre les valeurs de référence de FORMULES §13.1.

## Périmètre technique
- Fichiers concernés : nouveau module `packages/core/src/batchCycle/` (`milestones.ts`, `index.ts`) + réexport dans `packages/core/src/index.ts` ; schéma Zod d'entrée dans `packages/core/src/schemas/` ; tests `packages/core/test/batchCycle/`.
- Hors périmètre explicite : la persistance des jalons (M9-07) ; l'UI de saisie (M9-12) ; l'agenda (M13) ; les durées par défaut elles-mêmes, qui sont en `Settings` (M9-02) et **fournies en entrée**, jamais lues par `core`.

## Spécification

**A. Fonction pure `buildBatchMilestones(input)`.**
Entrée : date d'ensemencement, durées en **jours entiers** par type de jalon, et présence ou non d'un dry hop. Sortie : liste ordonnée de jalons `{ kind, plannedDurationDays, plannedStartAt, plannedEndAt, sortOrder }`, conforme à l'enum `BatchMilestoneKind` de M9-02.

Règles, telles qu'écrites en FORMULES §13.1 — **aucune n'est à réinventer ici** :
- enchaînement `FERMENTATION → DRY_HOP (optionnel) → COLD_CRASH → GARDE`, chaque jalon démarrant à la fin du précédent ;
- **dry hop conditionnel** : présent seulement si la recette porte un houblon en `use = DRY_HOP` ; absent, la séquence se referme sans trou ;
- une **durée nulle supprime** le jalon (pas de jalon de durée zéro) ;
- durées entières bornées `[0, 365]`, hors bornes ⇒ erreur de validation Zod explicite ;
- dates **calendaires** dérivées dans le fuseau de l'instance, fourni en entrée (`Settings.timezone`) — `core` ne lit ni horloge ni fuseau système.

**B. Détection du dry hop depuis le snapshot.**
Exposer un helper qui répond « cette recette comporte-t-elle un dry hop ? » en lisant défensivement les ingrédients du `recipeSnapshot` (catégorie `HOP`, `use = DRY_HOP`). Snapshot absent, corrompu ou sans houblon ⇒ `false`, jamais d'exception. Ce helper alimente l'UI de M9-12, qui ne doit pas refaire l'analyse.

**C. Pureté et fuseau.** Aucune lecture d'horloge : la date d'ensemencement est une **entrée**. Le passage aux dates calendaires doit être robuste aux changements d'heure (une garde de 21 jours reste 21 jours calendaires, y compris à travers un passage heure d'été / heure d'hiver) — le tester explicitement, c'est le piège classique d'une implémentation naïve en millisecondes.

**D. Valeurs de validation.** Reprendre **littéralement** les valeurs de référence de FORMULES §13.1 : ensemencement `2026-03-01`, 14 / 3 / 2 / 21 j → fin de garde `2026-04-10` (40 j) ; la même série **sans dry hop** → fin de garde `2026-04-07` (37 j).

## Definition of Done
- [ ] `buildBatchMilestones` pure, déterministe, sans horloge ni dépendance DB/UI, exportée depuis `@brasso/core`
- [ ] Tests core validant les **deux valeurs de référence** de FORMULES §13.1 (avec et sans dry hop)
- [ ] Tests des cas limites : durée 0 (jalon supprimé), durée > 365 (rejet Zod), durées toutes nulles, traversée d'un changement d'heure
- [ ] Helper de détection du dry hop testé sur snapshot valide, sans houblon, corrompu et absent
- [ ] Couverture `core` **100 %** maintenue
- [ ] Lint + typecheck + CI verts ; Prettier passé sur tous les fichiers touchés
- [ ] Critère observable : la séquence de jalons d'un brassin est calculable depuis `@brasso/core` sans aucune dépendance à la base

## Dépendances
Bloqué par : {{M9-01}} (FORMULES §13.1 fait foi), {{M9-02}} (enum `BatchMilestoneKind`) — Bloque : {{M9-07}}, {{M9-12}}
