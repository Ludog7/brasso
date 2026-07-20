---
labels: adr, docs, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-01 — adr : ADR-12 « extension de la matrice RBAC » (ressources `taches`, `agenda`, scission de `parametres`)

## Contexte
La matrice §3.5 est **figée** (ADR-10) et `apps/api/src/rbac/matrix.ts:8` porte l'invariant en toutes lettres : « toute évolution de la matrice = ticket `type:adr` ». Trois besoins du dev step 2 la font bouger :

1. **M13** introduit un volet Tâches et un agenda interne : deux ressources protégées qui n'existent pas (`taches`, `agenda`).
2. **M10-05/M10-08** ouvrent un volet « Options générales ». Or `parametres` vaut aujourd'hui `admin: CRUD` et **rien** pour les trois autres rôles (`matrix.ts:73`). Tel quel, **un brasseur ne peut pas lire les options** — donc pas le nom, le logo ni la couleur de marque. Le critère de démo M10 (« identité appliquée à tout l'écran ») serait **inatteignable pour 3 rôles sur 4**.
3. **§9.2 Q9** a tranché que le sous-volet « Accès » est une **restitution en lecture**, pas un éditeur. Cette position mérite d'être actée noir sur blanc, sinon elle sera re-litigée à chaque milestone.

C'est le **premier ticket du milestone** : M10-05 (module `settings`) et M10-08 (volet Options) ne peuvent pas déclarer leur couple `(ressource, action)` avant que cet ADR soit tranché. SOURCE : SPEC-ORCHESTRATION §9.2 (Q9), §9.3, §9.4 ; `docs/adr/README.md` ; `apps/api/src/rbac/matrix.ts`.

## Objectif
`docs/adr/ADR-12-extension-matrice-rbac.md` existe, statut **Acceptée**, et fixe sans ambiguïté : les cellules de `taches` et `agenda` pour les 4 rôles, la façon dont les options générales deviennent lisibles sans ouvrir l'administration des utilisateurs, et le caractère **non éditable** de la matrice.

## Périmètre technique
- Fichiers concernés : `docs/adr/ADR-12-extension-matrice-rbac.md` (nouveau) ; `docs/adr/README.md` (index : statut `Prévu` → `Acceptée`) ; `docs/SPEC-ORCHESTRATION.md` §3.5 (mention renvoyant vers l'ADR, **sans réécrire** la ligne d'origine — règle de cohérence du README).
- Hors périmètre explicite : **tout code**. `matrix.ts` n'est pas modifié ici — l'encodage des nouvelles cellules appartient à M10-05 (`parametres`) et à M13 (`taches`, `agenda`). Ce ticket produit la décision, pas son application.

## Spécification

**A. Le point dur — `parametres` est aujourd'hui une ressource à deux têtes.**
La ligne §3.5 s'intitule « Paramètres/**usr** » : la même ressource garde les réglages de l'instance **et** l'administration des utilisateurs. Ouvrir `parametres:read` aux 4 rôles pour rendre le logo lisible ouvrirait **du même geste la liste des utilisateurs** en lecture. C'est la décision centrale de cet ADR et elle doit être prise explicitement, pas subie.

Options à instruire, chacune avec son coût :

| Option | Principe | Coût / risque |
|---|---|---|
| **(a)** Ouvrir `parametres:read` aux 4 rôles | Une ligne de matrice à changer | **Élargit la lecture à l'administration des utilisateurs.** Deny-by-default affaibli par effet de bord — le genre d'élargissement qu'on ne remarque qu'après |
| **(b)** Scinder en deux ressources : `parametres` (admin CRUD, dont utilisateurs) et **`options`** (read : 4 rôles ; update : admin) | Sépare deux préoccupations que seul l'historique avait réunies | Une ressource de plus à déclarer ; les routes existantes sous `parametres` restent inchangées |
| **(c)** Garder `parametres` fermé + exposer l'apparence par une route de marque dédiée | Pas de changement de matrice | Crée un contournement hors matrice — précisément ce que le deny-by-default interdit |

> **Tranché par Ludo le 2026-07-20 — option (b) : `parametres` est scindé en deux ressources.**
> `parametres` conserve l'administration des utilisateurs et des réglages sensibles (**admin CRUD**, inchangé) ; une ressource **`options`** est créée pour les options générales (**read : les 4 rôles ; update : admin**). Motif retenu : l'élargissement de §9.4 ne doit pas se payer d'un accès en lecture à l'administration des comptes — la ressource unique réunissait deux préoccupations que seul l'historique avait rapprochées.
>
> L'ADR **conserve néanmoins les trois options écrites et motive le rejet** de (a) et (c) : on veut pouvoir relire le raisonnement, pas seulement son résultat.

**Conséquence sur le vocabulaire du milestone** : là où §9.3/§9.4 et l'epic parlent d'« **élargissement de `parametres`** », lire désormais « **scission de `parametres`, création de `options`** ». La mention de renvoi ajoutée en §3.5 doit le dire explicitement, sinon la spec et l'ADR se contrediront à la lecture.

**Sous-question à trancher dans la foulée** : l'écran de **connexion** doit-il afficher le nom et le logo de la brasserie ? Si oui, une part de l'apparence est lisible **avant authentification** et doit être isolée du reste des options (nom, logo, couleur — rien d'autre). Le contexte est une appliance **LAN-only** (M14), donc l'exposition est faible, mais elle doit être décidée et bornée, pas héritée par accident.

**B. Cellules de `taches` et `agenda`.**
Proposer et justifier chaque cellule ; toute cellule vide est un **refus explicite**, pas un oubli. Point de départ à discuter :

| Ressource | admin | brasseur | caisse | rgpd |
|---|---|---|---|---|
| `taches` | CRUD | CRUD | R | — |
| `agenda` | CRUD | CRUD | R | — |

Justifier notamment : pourquoi `rgpd` n'a rien (son périmètre est la donnée personnelle, pas la vie de l'atelier) ; pourquoi `caisse` lit sans écrire ; et si une tâche **assignée** à un utilisateur lui devient modifiable indépendamment de son rôle — auquel cas c'est une règle **de propriété** (ownership) et non de matrice, à écrire comme telle pour ne pas la confondre avec du RBAC.

**C. Acter « presets lisibles, matrice non éditable ».**
Reprendre et figer les trois motifs de §9.2 Q9 : déplacer la source de vérité en base détruirait la garantie typée ; un admin pourrait se retirer ses propres droits et **verrouiller l'instance** ; aucun besoin fonctionnel fin n'est établi. Écrire que l'édition fine est **reportée** et exigera son propre ADR. Réaffirmer le deny-by-default et l'invariant de `matrix.ts:8`.

**D. Conséquences à écrire.**
Ce que l'ADR impose à M10-05 (déclarations `(ressource, action)` des routes `settings`), à M10-08 (le volet Accès **restitue** — l'UI ne doit pas suggérer une modification impossible), à M13 (encodage de `taches`/`agenda`), et aux tests (toute cellule ajoutée est asservie par un test de refus, pas seulement d'autorisation).

## Definition of Done
- [ ] `docs/adr/ADR-12-extension-matrice-rbac.md` créé au **gabarit du README** (Statut / Date / Ticket / Amende ; Contexte & problème ; Options envisagées ; Décision ; Conséquences)
- [ ] Statut **Acceptée**, date du jour, n° d'issue renseigné, champ « Amende » explicite (ADR-12 est **nouveau** : il n'amende pas, il étend — l'écrire)
- [ ] La **scission `parametres` / `options`** est actée (arbitrage Ludo du 2026-07-20), **les trois options restant écrites** avec le motif de rejet de (a) et (c)
- [ ] Les cellules de la nouvelle ressource `options` sont fixées pour les 4 rôles (read : 4 rôles ; update : admin) et celles de `parametres` explicitement **laissées inchangées**
- [ ] La mention de renvoi en §3.5 précise que « élargissement de `parametres` » (§9.3/§9.4, epic) se lit désormais « scission + ressource `options` »
- [ ] Le sort de l'écran de connexion (apparence avant authentification) est tranché et **borné** aux seuls champs nommés
- [ ] Les cellules de `taches` et `agenda` sont fixées **pour les 4 rôles**, chaque cellule vide justifiée comme un refus
- [ ] La position « matrice non éditable » est actée avec ses trois motifs, et le deny-by-default réaffirmé
- [ ] `docs/adr/README.md` : index à jour (ADR-12 → **Acceptée**)
- [ ] `SPEC-ORCHESTRATION.md` §3.5 porte une **mention de renvoi** vers l'ADR — la ligne d'origine n'est pas réécrite
- [ ] Critère observable : M10-05 et M10-08 peuvent déclarer leurs couples `(ressource, action)` **sans aucune décision d'accès restant à prendre**

## Dépendances
Bloqué par : validation de la démo M9 — Bloque : **tout M10** (§9.3 : les tickets ADR bloquent le milestone), en particulier {{M10-05}}, {{M10-08}}, et {{M13}} (ressources `taches` / `agenda`)
