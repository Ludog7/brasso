# ADR — décisions d'architecture

> Emplacement désigné par `CLAUDE.md` et `SPEC-ORCHESTRATION.md` §2. Ce dossier était référencé depuis le début du projet mais restait vide : les **ADR-01 à ADR-11** vivent, figés, dans le tableau de **`SPEC-ORCHESTRATION.md` §0**. Ils y restent — on ne les rapatrie pas.
>
> Ce dossier accueille les ADR **à partir d'ADR-12**, c'est-à-dire toute décision prise **en cours de route**, qui crée ou remet en cause une décision d'architecture.

## Quand écrire un ADR

Règle de `CLAUDE.md` : **les ADR §0 sont figés**. Toute remise en cause passe par un ticket `type:adr` **et** un fichier ici. Concrètement, un ADR est requis dès qu'on :

- **contredit** une décision figée (ex. ADR-05 impose « mode sombre par défaut » — passer au clair par défaut est un renversement, pas un réglage) ;
- **étend** un invariant de sécurité (ex. la matrice RBAC §3.5, dont `apps/api/src/rbac/matrix.ts` porte l'invariant « toute évolution = ticket `type:adr` ») ;
- **modifie** le modèle d'authentification (ADR-10).

À l'inverse, **pas** d'ADR pour : ajouter une valeur à un enum métier, ajouter une table, ajouter une route sous une ressource RBAC existante. Ce sont des extensions, pas des décisions d'architecture.

## Convention de fichier

Un fichier par ADR : `docs/adr/ADR-<nn>-<slug>.md`, numérotation **continue** après ADR-11 (le §0 s'arrête là), jamais réattribuée — un ADR abandonné garde son numéro avec le statut `Rejetée`.

```markdown
# ADR-<nn> — <titre>

- **Statut** : Proposée | Acceptée | Rejetée | Remplacée par ADR-<nn>
- **Date** : AAAA-MM-JJ
- **Ticket** : #<n° de l'issue `type:adr`>
- **Amende** : ADR-<nn> (si cet ADR modifie une décision existante) — sinon « — »

## Contexte & problème
Ce qui motive la décision, les contraintes réelles.

## Options envisagées
Chaque option avec son coût et son risque. Une option écartée doit dire **pourquoi**.

## Décision
Ce qui est décidé, en une affirmation nette.

## Conséquences
Ce que cela impose au code, au schéma, aux tests, à l'exploitation.
Y compris les conséquences **négatives** assumées.
```

## Règle de cohérence

Un ADR qui **amende** une décision du §0 doit laisser la spec cohérente : ajouter dans `SPEC-ORCHESTRATION.md` §0 une mention renvoyant vers le fichier d'ADR, plutôt que réécrire la ligne d'origine. On veut pouvoir lire l'historique de la décision, pas seulement son état final.

## Index

| ADR | Titre | Statut |
|---|---|---|
| ADR-01 → ADR-11 | Décisions fondatrices | Figées — voir `SPEC-ORCHESTRATION.md` §0 |
| ADR-12 | Extension de la matrice RBAC (ressources `taches`, `agenda`, scission de `parametres` / création d'`options`) | **Acceptée** (2026-07-20) |
| ADR-13 | Bascule d'utilisateur par PIN sur poste partagé (amende ADR-10) | **Acceptée** (2026-07-20) |
| ADR-14 | Thème clair par défaut, basculable en sombre, & thème dérivé d'une couleur de marque (amende ADR-05) | Sens tranché (2026-07-18) — rédaction au ticket M10-03 |
