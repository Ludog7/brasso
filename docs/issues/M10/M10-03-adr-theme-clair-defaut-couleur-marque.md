---
labels: adr, docs, web, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-03 — adr : ADR-14 « thème clair par défaut, basculable, & thème dérivé d'une couleur de marque » (amende ADR-05)

## Contexte
ADR-05 impose aujourd'hui « **mode sombre par défaut** » et le code l'applique en dur : `apps/web/index.html:2` porte `<html lang="fr" class="dark">`, `apps/web/src/index.css:3` documente la classe comme « défaut atelier, ADR-05 ». Le premier test d'usage a conduit Ludo à **trancher le sens inverse le 2026-07-18** : thème **clair par défaut**, avec **bascule clair/sombre dans les Options**.

C'est le **premier renversement d'ADR du projet**. `CLAUDE.md` l'autorise — par ticket `type:adr` et fichier dans `docs/adr/` — et `docs/adr/README.md:11` cite précisément ce cas comme l'archétype du renversement (« passer au clair par défaut est un renversement, pas un réglage »). Le sens de la décision n'est **pas** à rediscuter ; ce ticket porte sa **rédaction formelle** et la **mise en cohérence** de la spec.

⚠️ Le piège est documenté : « mode sombre par défaut » figure à **deux endroits** — la ligne ADR-05 du tableau §0 (`SPEC-ORCHESTRATION.md:23`) **et** la liste des règles UI atelier de §6 (`SPEC-ORCHESTRATION.md:332`). N'amender que l'ADR laisserait la spec se contredire elle-même. SOURCE : SPEC-ORCHESTRATION §0 (ADR-05), §6, §9.3 ; `docs/adr/README.md`.

> **Tranché par Ludo le 2026-07-20 — la bascule du défaut est appliquée « dans le dur », tout de suite.**
> Le passage au **thème clair par défaut** est appliqué immédiatement en dur (retrait du `class="dark"` figé, jetons de base en clair), **sans attendre** la bascule configurable. Motif : toute la suite de M10 — fondations design system, volet Options, bandeau, passe sur l'existant — sera jugée **dans le thème réellement cible**. Le faire en fin de milestone obligerait à réévaluer chaque écran une seconde fois.
>
> La **bascule clair/sombre configurable** et la **dérivation depuis la couleur de marque** sont donc **retirées de M10-07/M10-08** et reportées à un ticket de **fin de milestone**, {{M10-11}}, quand le design system existera pour les porter.

**Conséquence d'ordonnancement, à assumer explicitement dans l'ADR.** Le changement de défaut est appliqué **avant** que l'ADR soit écrit : l'ADR-14 **ratifie** une modification déjà en place plutôt que de la précéder. C'est une inversion de l'ordre habituel, **décidée et datée par Ludo le 2026-07-20**, pas un contournement de la règle `CLAUDE.md`. L'ADR doit le dire en une phrase — sans quoi un lecteur ultérieur conclura, à juste titre, qu'on a modifié un invariant sans décision.

## Objectif
`docs/adr/ADR-14-theme-clair-defaut-couleur-marque.md` existe, statut **Acceptée**, ratifie le défaut clair déjà appliqué, et donne à {{M10-11}} une règle de dérivation de thème **opposable et testable** à partir d'une seule couleur de marque, garantissant le **contraste AA dans les deux thèmes**.

## Périmètre technique
- Fichiers concernés : `docs/adr/ADR-14-theme-clair-defaut-couleur-marque.md` (nouveau) ; `docs/adr/README.md` (index) ; `docs/SPEC-ORCHESTRATION.md` **§0 (ligne ADR-05)** et **§6** — les **deux** ; `docs/issues/epics/M10-epic.md` (inventaire : la bascule quitte M10-07/M10-08 pour {{M10-11}}).
- Hors périmètre explicite : **tout code**. Le retrait du `dark` figé est porté par son propre ticket ; la bascule configurable et la dérivation de marque par {{M10-11}}. Ce ticket produit la décision, pas son application.

## Spécification

**A. Acter le renversement, avec son motif.**
Écrire ce qui a changé depuis ADR-05 : la cible reste la tablette d'atelier, mais l'usage réel a montré que l'application sert **aussi** en bureau et en lumière du jour, et le sombre imposé a été perçu comme « peu esthétique ». Le mode sombre n'est **pas supprimé** — il devient un **choix**. Un ADR qui prétendrait que la décision d'origine était erronée serait injuste envers elle : elle était fondée sur une hypothèse d'usage que le terrain a corrigée. L'écrire ainsi.

**B. Le point dur — dériver un thème AA depuis une couleur choisie par un humain.**
Un utilisateur choisira une couleur de marque quelconque, y compris un jaune très clair ou un bleu très sombre. La question à trancher : **que fait le système quand la couleur choisie ne peut pas tenir le contraste AA** ?

| Option | Principe | Coût / risque |
|---|---|---|
| **(a)** Accepter la couleur telle quelle | Fidélité à la marque | **Casse le contraste AA** — une exigence §6 et un enjeu d'accessibilité réel |
| **(b)** Ajuster automatiquement la couleur (luminosité) jusqu'à atteindre AA | Toujours lisible, sans effort | L'utilisateur voit s'afficher une couleur qui **n'est pas celle qu'il a saisie** — surprenant s'il n'est pas prévenu |
| **(c)** Accepter la couleur pour les **aplats de marque** (bandeau, accents) et dériver **séparément** la couleur du **texte posé dessus** | Respecte le choix ET la lisibilité | Impose de distinguer clairement « couleur de marque » et « couleur de contraste dérivée » |

**Recommandation à instruire : (c)**, avec avertissement visible si la couleur saisie ne permet aucune dérivation AA satisfaisante. Ce qu'on ne fait **pas** : afficher un badge « accessible » — ce serait le travers exact qu'ADR-11 proscrit ailleurs. On mesure, on affiche le ratio, on avertit ; on ne certifie pas.

**À écrire dans l'ADR** : l'**algorithme** de dérivation (espace colorimétrique, calcul du ratio de contraste, seuil retenu — AA = 4,5:1 pour le texte courant, 3:1 pour le grand texte et les éléments d'interface), et **au moins deux valeurs de référence chiffrées** (une couleur de marque → la couleur de contraste attendue et le ratio obtenu) pour que M10-07 dispose d'un cas de test opposable, comme le veut la discipline de `FORMULES-BRASSICOLES.md`.

**C. Persistance du choix de thème.**
La **décision** appartient à cet ADR même si son **application** revient à {{M10-11}} : trancher maintenant évite que M10-07 pose des jetons incompatibles avec le mécanisme retenu.

Trancher : le thème est-il une préférence **par utilisateur** (en base, suit la personne d'un poste à l'autre) ou **par poste** (stockage local, suit la tablette) ? Sur un poste **partagé avec bascule PIN** (ADR-13, où *tous* les rôles basculent — arbitrage du 2026-07-20), les deux réponses divergent visiblement : un thème par utilisateur **repeint l'écran à chaque relève**, plusieurs fois par séance de brassage. Nommer le choix et sa raison. Écrire aussi le comportement **hors ligne** (ADR-08) : le thème doit s'appliquer au premier rendu, sans attendre une réponse serveur — donc sans **flash** de thème incorrect au chargement.

**D. Couverture des surfaces.**
L'identité (nom, logo, couleur) s'applique au bandeau, aux tonalités et aux lignes — mais aussi à des surfaces déjà livrées qu'on oublie facilement : l'**écran d'affichage du bar** (M7, plein écran, vu par le public), l'écran de **connexion** (cf. sous-question de M10-01), et les **exports**. Lister les surfaces couvertes et celles qui ne le sont **pas**, explicitement.

**E. Mise en cohérence de la spec — les deux emplacements.**
- **§0, ligne ADR-05** : ajouter une mention de renvoi vers ADR-14. La ligne d'origine **n'est pas réécrite** (règle de cohérence `docs/adr/README.md:45` : on veut lire l'historique de la décision, pas seulement son état final).
- **§6** : la règle « mode sombre par défaut » est **factuellement fausse** après cet ADR ; elle doit être corrigée en « thème clair par défaut, bascule clair/sombre en Options », avec renvoi vers ADR-14. Les autres règles UI atelier de la ligne (cibles ≥ 48 px, contraste AA, zéro drag-and-drop) sont **inchangées** — ne pas les emporter au passage.

## Definition of Done
- [ ] `docs/adr/ADR-14-theme-clair-defaut-couleur-marque.md` créé au gabarit du README, statut **Acceptée**, date, n° d'issue, champ « Amende » = **ADR-05**
- [ ] Le renversement est acté avec son motif d'usage, et le fait que le sombre **subsiste comme choix** est écrit noir sur blanc
- [ ] L'**inversion d'ordonnancement** est assumée en une phrase : l'ADR ratifie un défaut déjà appliqué en dur, sur décision datée de Ludo (2026-07-20)
- [ ] La règle de dérivation AA est tranchée, les trois options écrites, le rejet motivé
- [ ] L'algorithme de dérivation est spécifié avec ses **seuils** (4,5:1 / 3:1) et **au moins deux valeurs de référence chiffrées** transposables en test
- [ ] Le comportement en cas de couleur non conforme est écrit — **avertissement, jamais de badge de conformité** (esprit ADR-11)
- [ ] La persistance du thème (utilisateur / poste) est tranchée, y compris son interaction avec la bascule PIN et l'absence de flash au chargement hors ligne
- [ ] Les surfaces couvertes **et non couvertes** par l'identité sont listées
- [ ] **`SPEC-ORCHESTRATION.md` §0** : mention de renvoi ajoutée sur ADR-05, ligne d'origine intacte
- [ ] **`SPEC-ORCHESTRATION.md` §6** : « mode sombre par défaut » corrigé, **les autres règles UI atelier préservées**
- [ ] `docs/adr/README.md` : index à jour (ADR-14 → **Acceptée**)
- [ ] Critère observable : `grep -n "sombre par défaut" docs/SPEC-ORCHESTRATION.md` ne renvoie **plus aucune règle en vigueur** (seules subsistent les mentions historiques explicitement datées)
- [ ] `docs/issues/epics/M10-epic.md` : l'inventaire reflète le déplacement de la bascule (M10-07 et M10-08 ne la portent plus) et l'ajout de {{M10-11}}
- [ ] Critère observable : {{M10-11}} peut implémenter la dérivation de thème **sans choisir un seuil ni un algorithme lui-même**

## Dépendances
Bloqué par : validation de la démo M9 — Bloque : {{M10-07}} (fondations design system), {{M10-08}} (sous-volet Apparence), {{M10-09}} (bandeau), {{M10-10}} (application à l'existant), {{M10-11}} (bascule configurable + dérivation de marque)
