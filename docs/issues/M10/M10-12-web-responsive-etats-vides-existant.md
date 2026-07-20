---
labels: web, feature, P1
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-12 — web : passe responsive & états vides sur les écrans déjà livrés

## Contexte
Le M10-10 d'origine réunissait trois travaux : l'homogénéité du thème sur l'existant, une passe **responsive**, et les **états vides**. Ils n'ont pas les mêmes prérequis.

L'homogénéité du thème était **urgente et sans dépendance** : elle a été avancée et traitée par {{M10-10}} (les couleurs accordées au fond sombre devenaient illisibles en clair). Les deux autres, eux, **consomment les primitives d'états vides / chargement / erreur** que {{M10-07}} livre. Les faire avant obligerait à inventer des primitives provisoires, puis à les remplacer — exactement le « repeindre deux fois » que l'ordonnancement de M10 cherche à éviter (epic M10).

Ce ticket porte donc la moitié restante, **après** {{M10-07}}. SOURCE : inventaire epic M10 ; arbitrage Ludo du 2026-07-20.

## Objectif
Les écrans déjà livrés adoptent les primitives du design system : plus d'écran vide sans explication, plus de mise en page cassée sur la largeur cible de l'atelier.

## Périmètre technique
- `apps/web/src/routes/**` et `apps/web/src/features/**` — écrans livrés de M0 à M9.
- Primitives issues de {{M10-07}} : états **vides**, **chargement**, **erreur**.
- Hors périmètre : les couleurs sémantiques (faites en {{M10-10}}) ; la bascule de thème ({{M10-11}}) ; toute évolution fonctionnelle — ce ticket ne change **aucun comportement**.

## Spécification

**A. États vides.** Recenser les écrans qui rendent une liste potentiellement vide et leur donner un état explicite (ce qu'on voit, pourquoi c'est vide, quelle action mène à la sortie). Un tableau vide sans un mot est un écran qui a l'air cassé.

**B. Chargement et erreur.** Même traitement pour les deux autres états, avec les primitives de {{M10-07}} — pas de solution locale réinventée écran par écran.

**C. Passe responsive.** Cible prioritaire : la **tablette d'atelier** (§6 : cibles tactiles ≥ 48 px). Vérifier qu'aucun écran ne déborde horizontalement et que les tableaux larges défilent dans leur propre conteneur plutôt que de pousser la page.

**D. Ce qu'on ne fait pas.** Aucune refonte de parcours, aucun renommage de libellé, aucun changement de comportement. Une anomalie fonctionnelle aperçue en passant se signale par un ticket `type:bug` — elle ne se corrige pas ici.

## Definition of Done
- [ ] Chaque écran rendant une liste potentiellement vide porte un **état vide explicite**
- [ ] Les états **chargement** et **erreur** utilisent les primitives de {{M10-07}}, sans solution locale
- [ ] Aucun **débordement horizontal** de page sur la largeur cible ; les tableaux larges défilent dans leur conteneur
- [ ] Cibles tactiles ≥ 48 px sur les parcours d'atelier (§6)
- [ ] **Aucun changement de comportement** ni de libellé ; wording ADR-11 intact
- [ ] Prettier passé sur tous les fichiers touchés ; CI verte
- [ ] Critère observable : parcourir les écrans M0→M9 sans rencontrer d'écran vide muet ni de mise en page débordante

## Dépendances
Bloqué par : {{M10-07}} (primitives états vides / chargement / erreur) — Bloque : rien
