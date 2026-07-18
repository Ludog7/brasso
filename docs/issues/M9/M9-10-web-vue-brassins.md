---
labels: web, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-10 — web : vue « Brassins » (liste, échéances, détail du cycle)

## Contexte
Le brief (§3.A.1) demande une **nouvelle vue** listant brassins passés et en cours, avec suivi des dates, servant de **point d'entrée vers les brassins créés depuis les recettes** et donnant accès au détail Jour J / cycle. C'est aujourd'hui le chaînon manquant de la navigation : un brassin planifié depuis une recette devient difficile à retrouver, et rien ne montre où en sont les fermentations en cours.

SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.1 ; SPEC-ORCHESTRATION §9.1. Route API livrée par {{M9-09}}.

## Objectif
Une vue « Brassins » donne, d'un coup d'œil, l'état de tous les brassins et leur prochaine échéance, et ouvre le détail du cycle de chacun.

## Périmètre technique
- Fichiers concernés : `apps/web/src/routes/batches/` et `apps/web/src/features/batches/` (existants — étendus, pas dupliqués) ; navigation dans `apps/web/src/routes/AppShell.tsx` ; tests `apps/web/src/test/`.
- Hors périmètre explicite : l'écran Jour J (M9-11) ; la saisie des durées (M9-12) ; le conditionnement (M9-13) ; le thème et l'identité visuelle (M10) ; le tableau de bord (M13).

## Spécification

**A. Liste.** Consommer `GET /batches` enrichi ({{M9-09}}) — **un seul appel**, pas de requête par ligne. Chaque ligne : numéro de brassin, nom de recette, statut, étape courante, **prochaine échéance** (date + intitulé du jalon), fin prévue. Mettre en évidence les échéances **dépassées ou proches** : c'est l'information qui déclenche une action à l'atelier. Filtres (statut, période, recette) et bascule « en cours / terminés », alignés sur les paramètres de la route.

**B. Détail du cycle.** Depuis une ligne, ouvrir le détail : frise des jalons (fermentation → dry hop → cold crash → garde) avec dates prévues et réelles, mesures de volume et rendement de conditionnement ({{M9-06}}), et accès direct à **l'écran Jour J** pour un brassin en brassage. Les jalons achevés, en cours et à venir doivent être visuellement distincts — sans reposer uniquement sur la couleur (contrainte d'accessibilité AA, §6).

**C. États vides, chargement, erreurs.** Exigence explicite du brief (§4) : aucun écran blanc. Trois états soignés — aucun brassin (avec l'action « planifier un brassin depuis une recette »), chargement (squelette, pas un spinner nu), erreur (message actionnable + réessai). C'est la première application concrète du fil rouge UX du lot.

**D. Responsive et cible tablette.** Cible principale = tablette d'atelier, doigts mouillés (§6) : cibles tactiles **≥ 48 px**, contraste AA, aucun drag-and-drop. En largeur réduite, la liste passe en cartes plutôt qu'en tableau tronqué ou scrollé horizontalement.

**E. Performance front.** Le budget de bundle est **surveillé** (`build.chunkSizeWarningLimit: 300`, cf. `docs/DEV.md`) : la vue est chargée à la demande via `React.lazy` comme les autres routes. Ne pas alourdir le socle initial.

**F. Réutilisation.** Réutiliser les primitives existantes (`apps/web/src/ui/`, shadcn) et les conventions de `apps/web/src/features/` — ne pas introduire de composant de liste concurrent de ceux déjà en place.

## Definition of Done
- [ ] Tests web (Vitest + Testing Library, harness `fetch` stubé conforme aux tests existants) : rendu de la liste, filtres, tri, mise en évidence des échéances proches/dépassées, navigation vers le détail
- [ ] Tests des **trois états** : vide, chargement, erreur
- [ ] Test de navigation : depuis une recette publiée jusqu'au brassin, et depuis la liste jusqu'à l'écran Jour J
- [ ] Vérification tablette : cibles ≥ 48 px, aucun scroll horizontal en largeur réduite
- [ ] Route en chargement différé ; aucun avertissement de taille de chunk Vite
- [ ] `pnpm --filter @brasso/web {typecheck,lint,test,build}` verts ; Prettier sur tous les fichiers touchés
- [ ] Critère observable : tous les brassins et leur prochaine échéance sont visibles depuis un écran unique

## Dépendances
Bloqué par : {{M9-09}} — Bloque : {{M9-12}}, {{M9-13}}, {{M9-14}}
