---
labels: docs, core, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-01 — docs : FORMULES §13 « cycle post-ensemencement & conditionnement » (jalons, volumes, rendement, répartition en contenants)

## Contexte
`CLAUDE.md` impose qu'**aucune formule ne soit écrite de mémoire** : toute règle de calcul s'écrit **d'abord** dans `docs/FORMULES-BRASSICOLES.md`, avec ses valeurs de référence, **puis** dans `packages/core` avec des tests validés contre ces valeurs. M9 introduit trois familles de calcul absentes du référentiel : la **datation des jalons** post-ensemencement, la **chaîne des volumes** du brassin (le brief §3.A.4 note qu'il manque les volumes de fin de brassin), et la **répartition du volume conditionné en contenants** (§3.A.5).

Ce ticket est le **premier** du milestone parce qu'il conditionne M9-05, M9-06 et M9-08 : sans référentiel écrit, ces tickets n'auraient pas de valeurs de validation opposables. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.3/§3.A.4/§3.A.5 ; SPEC-ORCHESTRATION §9.2 (Q4) ; `docs/FORMULES-BRASSICOLES.md`.

## Objectif
`FORMULES-BRASSICOLES.md` porte une section §13 complète et chiffrée décrivant les jalons datés, la chaîne des volumes et la répartition en contenants — chaque règle assortie d'au moins une valeur de référence testable.

## Périmètre technique
- Fichiers concernés : `docs/FORMULES-BRASSICOLES.md` (nouvelle **§13** + entrée en Annexe B pour les constantes + Annexe C pour les sources) ; `docs/SPEC-FONCTIONNELLE.md` si une précision métier s'avère nécessaire.
- Hors périmètre explicite : **tout code**. Ce ticket ne touche ni `packages/core`, ni l'API, ni le web — l'implémentation est portée par M9-05 (jalons), M9-06 (volumes) et M9-08 (conditionnement). Les durées par défaut elles-mêmes ne sont pas des formules : elles vivront en `Settings` (M9-02).

## Spécification

**A. §13.1 — Jalons datés du cycle post-ensemencement.**
À la validation de l'ensemencement, le brassin enchaîne des phases de durées prévisionnelles. Documenter le calcul de dates, purement déterministe (aucune lecture d'horloge dans `core` : la date d'ensemencement est une **entrée**) :

```
dateDébut(phase₀)  = dateEnsemencement
dateFin(phaseᵢ)    = dateDébut(phaseᵢ) + duréeᵢ (jours)
dateDébut(phaseᵢ₊₁) = dateFin(phaseᵢ)
```

Séquence des phases : `FERMENTATION → DRY_HOP (optionnelle) → COLD_CRASH → GARDE`. Règles à écrire explicitement :
- Le **dry hop est conditionnel** : présent seulement si la recette porte un ingrédient houblon en `use = DRY_HOP`. Absent, la séquence se referme sans trou (le cold crash enchaîne sur la fermentation).
- Une durée nulle **supprime** la phase de la séquence (elle ne produit pas un jalon de durée zéro).
- Les durées sont des **entiers en jours**, bornées `[0, 365]` — au-delà, erreur de validation.
- Préciser le traitement du fuseau : les jalons sont des dates **calendaires** dérivées dans le fuseau de l'instance (`Settings.timezone`), pas des instants UTC bruts.

**Valeur de référence à inscrire** : ensemencement le `2026-03-01`, fermentation 14 j, dry hop 3 j, cold crash 2 j, garde 21 j → fin de fermentation `2026-03-15`, fin de dry hop `2026-03-18`, fin de cold crash `2026-03-20`, **fin de garde `2026-04-10`**, soit 40 jours de cycle total. Ajouter la même série **sans dry hop** → fin de garde `2026-04-07` (37 j).

**B. §13.2 — Chaîne des volumes du brassin.**
Documenter la succession des volumes et leurs pertes, en réutilisant les paramètres d'équipement **existants** (`deadspaceL`, `transferLossL`, `evaporationRateLPerHour`, `grainAbsorptionLPerKg`) :

```
volumePréÉbullition   (mesuré à la filtration)
volumePostÉbullition  = volumePréÉbullition − évaporation(durée × taux)
volumeTransféré       = volumePostÉbullition − deadspaceL − pertes au whirlpool
volumeEnsemencé       (mesuré — sert déjà à l'ajustement du stock, M5)
volumeConditionné     (mesuré en fin de garde — nouveau)
```

Puis le **rendement de conditionnement**, indicateur de fin de brassin :

```
rendementConditionnement (%) = 100 × volumeConditionné / volumePréÉbullition
```

Écrire que ce rendement est un **indicateur de process** (pertes cumulées), à ne pas confondre avec le `realEfficiency` de §9.1 qui porte sur l'extraction des sucres. Borne de vraisemblance : un rendement > 100 % est impossible ⇒ avertissement. **Valeur de référence** : 30 L pré-ébullition, 24 L conditionnés → **80 %**.

**C. §13.3 — Répartition du volume conditionné en contenants.**
Un volume se répartit en contenants de contenance connue (bouteille 33 cl / 75 cl, fût 20 L / 30 L…) :

```
nbUnités     = floor(volumeDisponibleL / contenanceL)
resteL       = volumeDisponibleL − nbUnités × contenanceL
```

Règles à documenter : la répartition est **descendante** quand plusieurs contenants sont servis depuis le même volume (les plus grands d'abord, le reste finissant dans les plus petits) ; le **reste** est conservé et affiché, jamais arrondi silencieusement ; la contenance est en **litres** (unité interne) et jamais en centilitres dans les calculs. **Valeur de référence** : 24 L répartis en fûts de 20 L puis bouteilles de 0,75 L → **1 fût + 5 bouteilles, reste 0,25 L**.

**D. Constantes et sources.** Ajouter en Annexe B les constantes introduites (contenances usuelles de référence à titre indicatif seulement — les contenances réelles sont des données de catalogue, pas des constantes) et en Annexe C la note de source : ces règles sont des conventions d'atelier, pas des modèles physiques externes — le préciser honnêtement plutôt que d'inventer une référence bibliographique.

## Definition of Done
- [ ] `FORMULES-BRASSICOLES.md` porte une **§13** complète (13.1 jalons, 13.2 volumes, 13.3 contenants) avec formules explicites
- [ ] Chaque sous-section porte **au moins une valeur de référence chiffrée** directement transposable en test (les 5 valeurs listées ci-dessus au minimum)
- [ ] Annexe B complétée (constantes) et Annexe C complétée (nature et origine des règles, sans source inventée)
- [ ] Les bornes et cas limites sont écrits (durée 0, durée > 365, rendement > 100 %, reste non nul)
- [ ] Prettier passé sur les fichiers touchés ; CI verte
- [ ] Critère observable : M9-05, M9-06 et M9-08 peuvent être implémentés **sans aucune décision de calcul** restant à prendre

## Dépendances
Bloqué par : validation du go-live M8 — Bloque : {{M9-05}}, {{M9-06}}, {{M9-08}}
