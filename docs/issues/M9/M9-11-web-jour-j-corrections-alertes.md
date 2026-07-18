---
labels: web, bug, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-11 — web : Jour J — validation manuelle, whirlpool, assainissement du circuit, alertes de houblonnage

## Contexte
Volet UI des corrections livrées côté `core` en {{M9-03}} et {{M9-04}}. Les deux bugs constatés lors du test réel se manifestent **à l'écran** : sur une étape sans timer (filtration), aucun bouton ne permet d'avancer, et la validation du refroidissement ne fait pas passer à la suite. L'opérateur n'a d'autre issue que « Forcer l'étape », ce qui pollue le journal d'écarts de procédure avec des écarts fictifs — et dégrade donc la valeur de traçabilité du journal lui-même.

S'y ajoutent l'affichage du whirlpool, la nouvelle étape d'assainissement du circuit de refroidissement et les alertes de houblonnage. SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.2 ; ADR-08 (file offline), ADR-11 (wording).

## Objectif
L'écran Jour J permet d'avancer sur **toute** étape sans écart abusif, affiche whirlpool et assainissement du circuit, et alerte aux ajouts de houblon et au hors-flamme.

## Périmètre technique
- Fichiers concernés : `apps/web/src/features/day/` et `apps/web/src/routes/` (écran Jour J, M4) ; file d'actions offline existante (`apps/web/src/offline/`) ; tests `apps/web/src/test/`.
- Hors périmètre explicite : la logique de transition (livrée en `core`, {{M9-03}}) ; la saisie des durées de fin d'ensemencement (M9-12) ; le conditionnement (M9-13).

## Spécification

**A. Validation manuelle des étapes sans timer (bug).**
Sur toute étape que `core` déclare validable manuellement ({{M9-03}}), afficher un bouton d'action **principal** et explicite (« Valider l'étape »), **distinct visuellement et textuellement** de « Forcer l'étape ». Point à ne pas rater : cette validation est une progression **nominale** et ne doit produire **aucun** `DeviationLog`. « Forcer l'étape » reste disponible, réservé aux conditions non remplies, et conserve son motif obligatoire.

**B. Sortie de refroidissement (bug).** À la validation du refroidissement, si la température mesurée atteint la cible, l'écran **avance** au jalon suivant. Sinon, il ne bloque pas l'opérateur sans explication : afficher l'écart à la cible, **conserver la mesure saisie** et permettre de consigner températures et horodatages jusqu'à l'ensemencement.

**C. Whirlpool.** Afficher la phase `WHIRLPOOL` entre ébullition et refroidissement, avec sa durée si la recette en déclare une. Un brassin dont la recette ne comporte pas de whirlpool ne doit **rien** afficher de nouveau (pas d'étape vide).

**D. Assainissement du circuit de refroidissement.** Afficher l'étape dérivée (~5 min avant le hors-flamme, {{M9-03}}) avec une consigne claire : faire circuler le moût bouillant dans le circuit de refroidissement.

> ⚠️ **ADR-11 — non négociable.** Le libellé, la consigne et toute aide contextuelle disent « **assainissement du circuit — indicateur d'aide à la décision** ». Les mots « stérilisation », « stérile », « conforme » et « sûr » sont **interdits**. Le disclaimer alimentaire permanent (`FOOD_SAFETY_DISCLAIMER` de `core`) est affiché sur l'écran qui porte cette étape.

**E. Alertes de houblonnage.** Depuis les échéances exposées par {{M9-04}}, alerter à l'approche et au moment de chaque ajout — amérisant, aromatique et **hors-flamme**, ce dernier clairement distingué du dernier ajout aromatique. L'alerte doit être perceptible en conditions d'atelier (visuelle **et** sonore, mains occupées, tablette posée à distance) et **acquittable**. Afficher la liste des ajouts à venir avec leur échéance, pour que l'opérateur anticipe la pesée.

**F. Offline.** Toutes ces actions passent par la file d'actions offline existante (ADR-08, M4-14) et se rejouent à la reconnexion. Les alertes de houblonnage reposent sur des **offsets** ({{M9-04}}) ancrés localement : elles doivent fonctionner **hors ligne**, ce qui est précisément le cas d'usage (wifi d'atelier instable). Ne pas introduire de dépendance réseau sur le chemin d'une alerte.

**G. Ergonomie atelier.** Cibles ≥ 48 px, contraste AA, aucun drag-and-drop (§6). L'action principale de l'étape courante doit être atteignable sans défilement.

## Definition of Done
- [ ] Tests web : validation manuelle d'une étape sans timer **sans** création de `DeviationLog` (assertion sur la requête émise) ; « Forcer l'étape » produisant toujours un écart avec motif ; sortie de refroidissement à température atteinte et conservation de la mesure sinon ; affichage du whirlpool (et **absence** si non déclaré) ; étape d'assainissement ; déclenchement et acquittement des alertes de houblonnage, dont le hors-flamme
- [ ] Test **ADR-11** : le contenu de `main` ne contient ni `/stéril/i`, ni `/conforme/i`, ni `/\bsûre?\b/i` ; disclaimer présent
- [ ] Test **offline** : alertes et validations fonctionnent hors ligne et se rejouent à la reconnexion
- [ ] Vérification manuelle offline documentée dans la PR (procédure de `docs/DEV.md` : build + preview, onglet hors ligne, rechargement, resynchronisation)
- [ ] `pnpm --filter @brasso/web {typecheck,lint,test,build}` verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : un brassage complet se déroule **sans jamais recourir à « Forcer l'étape »** quand tout se passe normalement

## Dépendances
Bloqué par : {{M9-03}}, {{M9-04}} — Bloque : {{M9-12}}, {{M9-14}}
