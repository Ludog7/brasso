---
labels: web, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-10 — web : lisibilité de l'existant en thème clair (jetons sémantiques `warning` / `success`)

## Contexte
Le basculement en thème clair par défaut (#284) est mécanique, mais il **expose** une dette préexistante : **68 utilitaires de couleur répartis sur 25 fichiers** utilisent des nuances de la palette Tailwind brute accordées au fond sombre (`text-amber-200`, `text-emerald-400`, `text-amber-300`…). Sur fond clair, ces éléments passent de lisibles à quasi invisibles.

Ce n'est pas un défaut cosmétique : le badge d'anomalies du hub, les encarts d'avertissement des éditeurs de recette et les indicateurs du Jour J **portent de l'information**. Les rendre illisibles est une régression fonctionnelle, pas une question de goût.

Deux constats structurent le ticket :

1. **Le motif est déjà factorisable** : `border-amber-500/40 bg-amber-500/10 text-amber-200` — l'encart d'avertissement — est **dupliqué 9 fois** à l'identique.
2. **Le précédent existe déjà** : `index.css` porte `--destructive` / `--destructive-foreground`, déclinés en clair **et** en sombre. Il manque simplement les équivalents `warning` et `success`.

Ce ticket est **avancé** en début de milestone (arbitrage Ludo du 2026-07-20) : sans lui, tout le travail d'interface qui suit serait jugé sur une base fonctionnelle mais tachée, et les écrans du Jour J — précisément l'usage qui justifiait le sombre à l'origine — donneraient une mauvaise impression du clair alors que c'est la dette qui est en cause.

## Objectif
Aucune information portée par la couleur n'est illisible en thème clair, et le rendu **sombre reste visuellement équivalent** à l'actuel.

## Périmètre technique
- `apps/web/src/index.css` : jetons `--warning` / `--success` (+ variantes), déclinés `:root` **et** `.dark`, exposés dans `@theme inline` — **en suivant exactement le patron de `--destructive`**.
- Les 25 fichiers portant les 68 utilitaires bruts.
- **Hors périmètre, délibérément** :
  - **L'extraction du composant d'encart d'avertissement** (les 9 duplications) → relève des primitives partagées de {{M10-07}}. Ce ticket unifie les *couleurs*, pas les *composants*.
  - La **passe responsive** et les **états vides**, qui composaient l'autre moitié du M10-10 d'origine → déplacés en {{M10-12}}, car ils consomment les primitives que {{M10-07}} n'a pas encore livrées. Les faire maintenant obligerait à les refaire.
  - La bascule configurable et la dérivation depuis la couleur de marque → {{M10-11}}.

## Spécification

**A. Jetons sémantiques.** Ajouter `--warning` et `--success` (et leurs `-foreground` si le patron de `--destructive` l'exige), avec une valeur **claire** dans `:root` et une valeur **sombre** dans `.dark`. Contrainte : contraste **AA** sur le fond sur lequel le jeton est réellement posé, dans les deux thèmes.

L'intérêt du jeton unique est qu'il absorbe les six usages actuels par simple modulation d'opacité : `text-warning`, `bg-warning/10`, `border-warning/40`. Un jeton par usage serait une prolifération inutile.

**B. Remplacement.** Substituer les 68 utilitaires bruts. Règle de non-régression : **le rendu sombre doit rester équivalent** — on corrige le clair, on ne redessine pas le sombre. Un écart visible en sombre est un défaut, pas une amélioration.

**C. Cas ne relevant pas d'un jeton sémantique.** Certains usages sont **décoratifs** et non sémantiques — notamment les segments colorés de `features/recipes/beer/StyleGauge.tsx` et le bouton destructif de `AnonymizeConfirmDialog.tsx`. Les traiter au cas par cas et **dire lesquels ont été laissés tels quels, avec le motif**. Ne pas forcer un jeton sémantique sur une couleur qui n'en porte pas.

**D. Wording ADR-11 inchangé.** Plusieurs des encarts touchés sont des indicateurs pH / stabilisation / carbonatation. Ce ticket change des **couleurs**, jamais un libellé : « indicateur d'aide à la décision », jamais « conforme » ni « sûr ». Toute reformulation aperçue en passant est **hors périmètre** — elle se signale, elle ne se corrige pas ici.

## Definition of Done
- [ ] `--warning` et `--success` existent en `:root` **et** `.dark`, exposés via `@theme inline`, calqués sur `--destructive`
- [ ] Les **68** utilitaires bruts sont traités : remplacés, ou **explicitement justifiés** comme décoratifs
- [ ] **Contraste AA vérifié** pour chaque jeton sur son fond réel, dans les **deux** thèmes
- [ ] **Non-régression du sombre** : le rendu sombre reste visuellement équivalent à l'actuel
- [ ] Aucun libellé modifié — wording ADR-11 intact
- [ ] Le badge d'anomalies du hub, les encarts des éditeurs de recette et les indicateurs du Jour J sont **lisibles en clair** (vérification à l'écran, pas seulement en test)
- [ ] Prettier passé sur **tous** les fichiers touchés ; CI verte
- [ ] Critère observable : `grep -rE "(text|bg|border)-(amber|emerald)-(100|200|300|400)" apps/web/src` ne renvoie plus que des cas décorats documentés

## Dépendances
Bloqué par : #284 (défaut clair appliqué) — Bloque : la pertinence visuelle de tout le travail d'interface M10 qui suit.
Adjacent : {{M10-07}} (extraction des composants d'encart), {{M10-12}} (responsive + états vides).
