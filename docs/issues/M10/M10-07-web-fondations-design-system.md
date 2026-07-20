---
labels: web, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-07 — web : fondations du design system (jetons, primitives d'état, encart d'avertissement)

## Contexte
Le verdict du premier test d'usage — « globalement assez basique et peu esthétique » — n'appelle pas une passe cosmétique mais un **socle** : des jetons cohérents et des primitives réutilisables sur lesquels tous les écrans ultérieurs s'appuieront. C'est le fil rouge UX de §4 : M10 pose les fondations, chaque ticket `web` suivant porte ensuite la conformité dans sa DoD.

Trois chantiers sont déjà **identifiés et chiffrés** par le travail de {{M10-10}} :

1. Les jetons `--warning` et `--success` existent et tiennent AA, mais **`--destructive` ne tient pas** — bug **#292**.
2. L'**encart d'avertissement** est dupliqué **9 fois** à l'identique (`border-warning/40 bg-warning/10 text-warning`) : jamais extrait en composant.
3. Les primitives d'**états vides / chargement / erreur** n'existent pas, ce qui bloque {{M10-12}}.

Ce ticket ne part donc pas d'une page blanche : il ramasse une dette déjà mesurée.

SOURCE : SPEC-ORCHESTRATION §4, §6, §9.3 ; ADR-14 ({{M10-03}}) ; #290 et #292.

## Objectif
Un socle de jetons et de primitives partagées, tenant le **contraste AA dans les deux thèmes**, sur lequel {{M10-08}}, {{M10-09}}, {{M10-11}} et {{M10-12}} s'appuient sans réinventer localement.

## Périmètre technique
- `apps/web/src/index.css` : jetons.
- `apps/web/src/ui/` : primitives partagées (encart, états vides / chargement / erreur).
- Hors périmètre : la **bascule** clair/sombre et la **dérivation depuis la couleur de marque** → {{M10-11}} ; la reprise écran par écran → {{M10-12}} ; le volet Options → {{M10-08}}.

## Spécification

**A. Corriger `--destructive` (bug #292).** Le jeton est calibré comme couleur de **remplissage** ; les deux rôles — aplat plein avec texte dessus, et texte sur teinte à 15 % — veulent des luminosités **opposées** en thème sombre. Un seul jeton ne peut pas les servir. Distinguer les deux rôles, comme le fait tout design system mature.

Contrainte : la tonalité `destructive` du `Badge` doit atteindre **AA (≥ 4,5:1)** en clair **et** en sombre, et les **boutons destructifs et alertes** existants ne doivent pas régresser. Le palliatif documenté dans `ui/badge.tsx` est alors retiré.

**B. Mesurer sur le pire fond réel, pas sur le fond uni.** Leçon chiffrée de #290 : un jeton confortable à 5:1 sur fond uni tombait à **4,42:1** sur un aplat du même jeton à 20 % — le motif réellement employé par les encarts et le badge d'anomalies. Toute nouvelle couleur se valide **sur le fond sur lequel elle est réellement posée**, dans les deux thèmes.

**C. Extraire l'encart d'avertissement.** Les 9 duplications deviennent un composant unique. Il portera aussi les indicateurs pH / stabilisation / carbonatation : **wording ADR-11** — « indicateur d'aide à la décision », **jamais** « conforme » ni « sûr ». Le composant ne doit pas rendre facile d'écrire un libellé qui viole l'ADR.

**D. Primitives d'état.** États **vide**, **chargement** et **erreur**, réutilisables. Un état vide utile dit trois choses : ce qu'on voit, pourquoi c'est vide, et quelle action en sort. Un tableau vide sans un mot a l'air cassé — c'est le défaut que {{M10-12}} devra corriger partout, et il lui faut ces briques.

**E. Ce qu'on ne fait pas.** Aucun changement de comportement, aucun renommage de libellé, aucune refonte de parcours. Ce ticket outille ; l'application écran par écran appartient à {{M10-12}}.

## Definition of Done
- [ ] **Bug #292 corrigé** : la tonalité `destructive` du `Badge` atteint **AA en clair et en sombre** ; palliatif de `ui/badge.tsx` retiré
- [ ] Boutons destructifs et alertes vérifiés après re-calibrage — **aucune régression**
- [ ] Chaque jeton nouveau ou modifié est mesuré **sur son fond réel** (y compris les aplats teintés), dans les **deux** thèmes
- [ ] L'encart d'avertissement est un **composant unique** ; les **9** duplications ont disparu
- [ ] Le composant d'encart respecte et **favorise** le wording ADR-11
- [ ] Primitives **état vide / chargement / erreur** livrées et documentées par l'usage
- [ ] Le garde anti-régression de palette brute (#290) reste **vert**
- [ ] Aucun changement de comportement ni de libellé
- [ ] Prettier passé sur **tous** les fichiers touchés ; CI verte
- [ ] Critère observable : {{M10-08}}, {{M10-11}} et {{M10-12}} peuvent être implémentés **sans créer une seule primitive locale**

## Dépendances
Bloqué par : {{M10-03}} (ADR-14) — Bloque : {{M10-08}}, {{M10-09}}, {{M10-11}}, {{M10-12}}. Corrige : #292
