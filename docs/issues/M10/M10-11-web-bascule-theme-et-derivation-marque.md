---
labels: web, feature, P1
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-11 — web : bascule clair/sombre configurable & dérivation du thème depuis la couleur de marque

## Contexte
Le **défaut clair** a été appliqué « dans le dur » en début de milestone (arbitrage Ludo du 2026-07-20, ratifié par ADR-14 / {{M10-03}}) afin que tout le travail d'interface de M10 soit jugé dans le thème réellement cible, plutôt que réévalué une seconde fois après coup.

Restait volontairement de côté ce qui n'avait pas de socle pour l'accueillir : rendre le thème **choisissable** et le faire **dériver d'une couleur de marque**. Ce ticket clôt le milestone en livrant ces deux capacités, une fois que {{M10-07}} a posé les jetons, que {{M10-08}} a ouvert le volet Options et que {{M10-10}} a homogénéisé l'existant.

Le mode sombre n'a jamais été supprimé — ADR-14 en fait un **choix utilisateur**. Ce ticket est celui qui rend cette phrase vraie. SOURCE : ADR-14 (`docs/adr/`) ; SPEC-ORCHESTRATION §9.3 ; epic M10.

## Objectif
Depuis les Options, on choisit le thème clair ou sombre et une couleur de marque ; les deux s'appliquent immédiatement, partout, en tenant le **contraste AA**, et survivent au rechargement — y compris hors ligne.

## Périmètre technique
- `apps/web/src/` : jetons de thème ({{M10-07}}), bascule dans le sous-volet Apparence ({{M10-08}}), application au bandeau ({{M10-09}}).
- Persistance selon la règle tranchée par **ADR-14 §C** (par utilisateur ou par poste — ne pas la re-trancher ici).
- Dérivation de la couleur de contraste : fonction **pure et testée**. Si elle relève du calcul déterministe réutilisable, elle a sa place dans `packages/core` — auquel cas la **couverture ≥ 90 %** s'applique.
- Hors périmètre : le défaut clair lui-même (déjà appliqué) ; les surfaces qu'ADR-14 a explicitement exclues.

## Spécification

**A. Bascule clair/sombre.** Dans le sous-volet Apparence. Application **immédiate**, sans rechargement. Persistance conforme à ADR-14 §C. Sur un poste partagé où **tous les rôles** basculent par PIN (ADR-13), vérifier le comportement à la relève d'utilisateur : le thème ne doit pas produire un scintillement à chaque bascule.

**B. Dérivation depuis la couleur de marque.** Appliquer l'algorithme et les **seuils fixés par ADR-14** (AA : 4,5:1 texte courant, 3:1 grand texte et éléments d'interface) — aucun seuil n'est choisi ici. Les valeurs de référence de l'ADR deviennent des **cas de test**.

**C. Couleur non conforme — wording.** Quand la couleur saisie ne permet aucune dérivation AA satisfaisante : **avertir**, en affichant le ratio mesuré. **Jamais de badge « accessible » ni « conforme »** — c'est le travers qu'ADR-11 proscrit sur les écrans pH, et il vaut ici pour les mêmes raisons : on mesure et on informe, on ne certifie pas.

**D. Pas de flash au chargement.** Le thème s'applique au **premier rendu**, sans attendre une réponse serveur (ADR-08, offline-first). Un rechargement hors ligne sur une route profonde ne doit pas afficher brièvement le mauvais thème.

## Definition of Done
- [ ] La bascule clair/sombre est accessible depuis les Options et s'applique **sans rechargement**
- [ ] Le choix **survit au rechargement**, y compris **hors ligne**, conformément à la règle ADR-14 §C
- [ ] La couleur de marque dérive une couleur de contraste selon l'algorithme d'ADR-14, **les valeurs de référence de l'ADR passant en test**
- [ ] Le **contraste AA est vérifié dans les deux thèmes** (4,5:1 / 3:1)
- [ ] Une couleur non conforme **avertit avec son ratio** — aucun badge de conformité (esprit ADR-11), wording testé
- [ ] **Aucun flash** de thème incorrect au premier rendu, y compris hors ligne
- [ ] Comportement vérifié à la **relève d'utilisateur par PIN** (pas de scintillement)
- [ ] Si la dérivation atterrit dans `packages/core` : **couverture ≥ 90 %** tenue
- [ ] Prettier passé sur **tous** les fichiers touchés ; CI verte
- [ ] Critère observable : depuis une instance neuve, choisir une couleur de marque et basculer en sombre — les deux se retrouvent appliqués partout après rechargement, hors ligne compris

## Dépendances
Bloqué par : {{M10-03}} (ADR-14 : algorithme, seuils, règle de persistance), {{M10-07}} (jetons), {{M10-08}} (volet Options), {{M10-10}} (existant homogénéisé) — Bloque : rien ; **ticket de clôture du milestone**
