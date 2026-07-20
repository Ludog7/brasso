# ADR-12 — Extension de la matrice RBAC : ressources `taches` et `agenda`, scission de `parametres`

- **Statut** : Acceptée
- **Date** : 2026-07-20
- **Ticket** : #286
- **Amende** : — (ADR-12 est **nouveau**. Il n'amende aucune décision : il **étend** la matrice §3.5 figée par ADR-10, en respectant l'invariant que celle-ci pose — toute évolution passe par un ADR. Aucune cellule existante n'est modifiée.)

## Contexte & problème

La matrice §3.5 est figée (ADR-10) et `apps/api/src/rbac/matrix.ts:8` porte l'invariant en toutes lettres : « Toute évolution de la matrice = ticket `type:adr` ». Le dev step 2 la fait bouger sur trois points, et deux d'entre eux bloquent M10 dès son deuxième ticket.

**1. Deux ressources manquantes.** M13 introduit un volet Tâches et un agenda interne. `taches` et `agenda` n'existent pas dans `RESOURCES` (`matrix.ts:20-29`). Deny-by-default oblige : sans cellule, toute route les concernant est refusée pour tout le monde — les écrans seraient inatteignables.

**2. `parametres` est une ressource à deux têtes.** La ligne §3.5 s'intitule « Paramètres / utilisateurs » : la même ressource garde les **réglages de l'instance** *et* l'**administration des comptes**. Elle vaut aujourd'hui `admin: CRUD` et **rien** pour les trois autres rôles (`matrix.ts:73`).

C'est le point dur. M10-05 (#296) expose les options générales — nom de l'association, logo, couleur de marque — et M10-08 (#299) les affiche. Or le critère de démo de M10 est « identité appliquée à tout l'écran ». Tel quel, **un brasseur ne peut pas lire le logo** : le critère serait inatteignable pour **3 rôles sur 4**. Il faut ouvrir quelque chose — mais ouvrir `parametres:read` ouvrirait, du même geste, la liste des utilisateurs en lecture. C'est un élargissement par effet de bord, le genre qu'on ne remarque qu'après.

**3. Une position à acter.** §9.2 Q9 a tranché que le sous-volet « Accès » est une **restitution en lecture**, pas un éditeur de droits. Tant que ce n'est pas écrit noir sur blanc, la question sera re-litigée à chaque milestone.

S'ajoute une contrainte nouvelle : l'écran de **connexion** doit afficher le nom et le logo de l'association. Une part de l'apparence devient donc lisible **avant authentification** — hors matrice par construction, puisqu'il n'y a pas encore de rôle.

## Options envisagées

Trois options ont été instruites pour rendre les options générales lisibles.

### (a) Ouvrir `parametres:read` aux 4 rôles

Une seule ligne de matrice à changer. **Rejetée** : `parametres` couvre l'administration des utilisateurs. Accorder `read` aux quatre rôles pour un logo donnerait à `caisse` et `brasseur` la lecture de la liste des comptes. Le deny-by-default n'est pas contourné frontalement — il est **affaibli par effet de bord**, ce qui est pire : rien dans le diff ne ressemble à une décision de sécurité. Le coût réel de l'option n'est pas visible à l'endroit où on la prend.

### (b) Scinder en deux ressources — **retenue**

`parametres` conserve l'administration des utilisateurs et les réglages sensibles ; une ressource **`options`** porte les options générales. Coût : une ressource de plus à déclarer, et un couple `(ressource, action)` à choisir correctement sur chaque route du module `settings`. Les routes existantes sous `parametres` restent inchangées.

### (c) Garder `parametres` fermé et exposer l'apparence par une route de marque dédiée

Aucun changement de matrice. **Rejetée** : cela crée une voie d'accès **hors matrice**, c'est-à-dire exactement ce que le deny-by-default interdit. `matrix.ts:4-6` affirme qu'« aucun contrôle d'accès n'est éparpillé ailleurs » ; l'option (c) commence à l'éparpiller. Une exception non déclarée est une exception qu'aucun test de refus ne couvre.

> **Tranché par Ludo le 2026-07-20 — option (b).**
> Motif retenu : l'élargissement demandé par §9.4 ne doit pas se payer d'un accès en lecture à l'administration des comptes. La ressource unique réunissait deux préoccupations que seul l'historique avait rapprochées.

## Décision

### 1. `parametres` est scindé ; la ressource `options` est créée

| Ressource | admin | brasseur | caisse | rgpd |
|---|---|---|---|---|
| `parametres` (comptes, réglages sensibles) | CRUD | — | — | — | 
| **`options`** (options générales) | CRUD | R | R | R |

- **`parametres` est laissé strictement inchangé** — mêmes cellules qu'aujourd'hui (`matrix.ts:73`). Cet ADR n'y touche pas.
- **`options`** : `read` pour les **quatre** rôles ; `create` / `update` / `delete` pour le **seul** `admin`. Un rôle non-admin qui tente une écriture est refusé par la matrice, pas par l'UI.

### 2. Sous-ensemble public, avant authentification

L'écran de connexion affiche le nom et le logo. Cette lecture est **hors matrice** : elle intervient avant tout rôle. Elle est donc bornée par énumération, pas par catégorie.

**Les trois champs publics, nommés un par un :**

1. le **nom** de l'association ;
2. le **logo** ;
3. la **couleur de marque**.

**Rien d'autre.** Et la règle qui rend cette borne durable : **tout champ d'`options` est privé par défaut**. Ajouter un quatrième champ au sous-ensemble public exige un **amendement de cet ADR**. La raison est explicite : « l'apparence » est une porte qui s'élargit toute seule au fil des milestones — un filtrage *par omission* laisserait fuiter le prochain champ ajouté sans que personne ne le décide. La liste blanche est la seule forme qui résiste au temps.

Trois propriétés supplémentaires de cette route publique :

- elle est **read-only** — aucune écriture n'est exposée sans authentification ;
- elle ne divulgue **pas l'existence de comptes** (ni nombre, ni identifiant, ni indice) ;
- elle ne divulgue **pas l'état d'installation** : si le nom n'est pas encore configuré, la réponse est indistinguable de celle d'une instance configurée sans nom. Une instance fraîche ne doit pas s'annoncer comme telle.

Contexte assumé : appliance **LAN-only** (M14), exposition faible et volontairement acceptée. Ce n'est pas une raison de relâcher la borne — c'est la raison pour laquelle une borne étroite suffit.

### 3. Cellules de `taches` et `agenda`

| Ressource | admin | brasseur | caisse | rgpd |
|---|---|---|---|---|
| `taches` | CRUD | CRUD | R | — |
| `agenda` | CRUD | CRUD | R | — |

Chaque cellule est un choix, y compris les vides. Justifications :

- **`admin` et `brasseur` en CRUD** : la vie de l'atelier est leur objet. Le brasseur planifie, crée et clôt les tâches et les événements ; lui refuser l'écriture viderait le volet de son usage.
- **`caisse` en R** : un bénévole de permanence a besoin de **voir** le planning (ouvertures du bar, événements, tâches en cours) pour s'organiser. Il n'a pas à réécrire la programmation de l'atelier. Lecture sans écriture, comme sur `transactions` (`matrix.ts:70`) — la dissymétrie est déjà un motif connu de cette matrice.
- **`rgpd` à vide — refus explicite, pas un oubli.** Le périmètre de ce rôle est la **donnée personnelle** (`membres`, `auditLog`), pas la vie de l'atelier. Lui donner accès aux tâches élargirait un rôle conçu étroit, par séparation des pouvoirs (§3.4). Un utilisateur qui a besoin des deux cumule les deux rôles : `can()` prend déjà l'**union** des permissions (`matrix.ts:97-99`). C'est le mécanisme prévu pour ce cas — il n'y a rien à assouplir dans la matrice.

### 4. Règle de propriété sur les tâches — **hors matrice**

> **Tranché par Ludo le 2026-07-20 — propriété étroite.**

Une tâche **assignée** à un utilisateur lui est modifiable **sur le seul champ `statut`**, quel que soit son rôle. Ni le titre, ni l'échéance, ni l'assignation, ni la suppression.

Ce point mérite d'être lu deux fois, parce qu'il est facile de le ranger au mauvais endroit : **ce n'est pas du RBAC.** Le RBAC autorise sur un couple `(ressource, action)`, sans regarder *quelle instance* est visée. Ici l'autorisation dépend de la **relation entre l'utilisateur et l'objet** — c'est une règle de **propriété**.

Conséquences de cette qualification, qui sont le vrai contenu de la décision :

- elle est portée par le **service** (`taches`), **jamais** par `matrix.ts` ni par le plugin RBAC ;
- la matrice reste ce qu'elle est : une table statique, typée, lisible d'un coup d'œil, testable sans base de données ;
- elle est **volontairement étroite**. Une propriété large (CRUD sur sa propre tâche) créerait un second système d'autorisation aussi puissant que la matrice, et l'option a été écartée pour cette raison précise ;
- elle est **asservie par ses propres tests**, dont au moins un test de **refus** : l'assigné qui tente de modifier un autre champ que `statut` est rejeté.

### 5. Presets lisibles, matrice non éditable

La matrice **n'est pas éditable en base ni par l'interface**. Trois motifs, repris de §9.2 Q9 et figés ici :

1. **La garantie typée disparaîtrait.** `RBAC_MATRIX` est un `Record<Resource, Record<Role, readonly Action[]>>` : le compilateur vérifie que toute ressource a une cellule pour tout rôle. Déplacer la source de vérité en base remplace une erreur de compilation par une erreur d'exécution — sur du contrôle d'accès.
2. **Un admin pourrait se retirer ses propres droits et verrouiller l'instance.** Sur une appliance LAN-only sans support extérieur, c'est un mode de panne sans issue.
3. **Aucun besoin fonctionnel fin n'est établi.** Quatre rôles couvrent les usages connus ; le cumul de rôles absorbe les cas mixtes.

L'édition fine des droits est **reportée**, pas rejetée : elle exigera son **propre ADR**, qui devra traiter au minimum le verrouillage (motif 2).

Le **deny-by-default** est réaffirmé : toute combinaison `(ressource, action, rôle)` non listée est refusée (`matrix.ts:5-6`), et l'invariant de `matrix.ts:8` reste en vigueur — cet ADR l'applique, il ne l'abroge pas.

## Conséquences

### Sur la spec

`SPEC-ORCHESTRATION.md` §9.3 et l'epic #245 parlent d'« **élargissement de `parametres`** ». Ce vocabulaire est **périmé** : lire désormais « **scission de `parametres`, création de la ressource `options`** ». Une mention de renvoi est ajoutée sous §3.5 ; la ligne d'origine du tableau n'est **pas** réécrite (règle de cohérence de `docs/adr/README.md`) — on veut pouvoir lire l'historique de la décision, pas seulement son état final.

### Sur le code

- **M10-05 (#296)** — module `settings`. Les routes de lecture des options déclarent `(options, read)` ; les routes d'écriture `(options, update)`. La route **publique** de l'écran de connexion est hors matrice : elle sert les **trois champs nommés** au §2 et rien d'autre, en liste blanche explicite. `RESOURCES` gagne `"options"` ; `RBAC_MATRIX` gagne sa ligne. **`parametres` n'est pas touché.**
- **M10-08 (#299)** — volet Options. Le sous-volet « Accès » **restitue** la matrice : l'UI ne doit rien présenter qui suggère une modification impossible (pas de champ grisé « bientôt », pas d'interrupteur inerte). Un écran qui ment sur ce qu'il permet est un défaut, pas un détail de présentation.
- **M13** — encodage de `taches` et `agenda` dans `RESOURCES` et `RBAC_MATRIX`, plus la règle de propriété au service des tâches.

### Sur les tests

Toute cellule ajoutée est asservie **dans les deux sens** : un test d'autorisation *et* un test de **refus**. Un test qui ne prouve que l'accès accordé laisserait passer une cellule trop ouverte sans rien signaler — c'est précisément le mode de défaillance que le deny-by-default cherche à rendre impossible. En particulier : `options:update` refusé à `brasseur`, `caisse` et `rgpd` ; `taches`/`agenda` en écriture refusés à `caisse` et en tout à `rgpd` ; la route publique ne renvoyant **que** les trois champs.

### Conséquences négatives assumées

- **Une ressource de plus.** `options` s'ajoute à `parametres`, et la frontière entre les deux devra être tenue à chaque nouveau réglage : ce qui touche aux comptes ou à la sécurité va dans `parametres`, le reste dans `options`. Une erreur de rangement est un élargissement silencieux — c'est le prix de la scission, et il se paie en vigilance de revue.
- **Deux mécanismes d'autorisation coexistent** (matrice + propriété sur les tâches). C'est un coût réel de compréhension, accepté parce que la propriété est bornée à **un seul champ d'une seule ressource** et documentée comme telle. Il faudra refuser sa deuxième occurrence aussi fermement que celle-ci a été bornée.
- **Une surface publique non authentifiée existe désormais**, si étroite soit-elle. Elle devra être re-examinée si l'instance sort un jour du LAN.
