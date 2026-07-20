# ADR-13 — Bascule d'utilisateur par PIN sur poste partagé

- **Statut** : Acceptée
- **Date** : 2026-07-20
- **Ticket** : #287
- **Amende** : **ADR-10** (modèle d'authentification). ADR-10 reste en vigueur — session cookie, Argon2id, RBAC maison. Cet ADR y **ajoute** une seconde voie d'ouverture de session, volontairement plus faible, et en borne l'usage.

## Contexte & problème

Le premier test d'usage a montré le besoin d'un poste d'atelier **partagé** : plusieurs personnes se succèdent sur la même tablette au cours d'un brassage, et ressaisir un mot de passe complet à chaque relève est un frein réel — au point que la tentation devient de rester connecté sous le compte du premier arrivé, ce qui détruit la traçabilité que le RBAC est censé produire.

Le brief demande une bascule « en 2 clics » par code PIN. Un PIN à 4–6 chiffres est un secret **beaucoup plus faible** qu'un mot de passe. Cela touche le modèle d'authentification, donc ADR-10, donc un ADR (`docs/adr/README.md` : « modifie le modèle d'authentification » ⇒ ADR requis).

**Le compromis, nommé sans le maquiller : on abaisse volontairement le niveau d'authentification pour gagner en ergonomie.** Le reste de cet ADR consiste à borner ce qu'on vient de concéder.

## Options envisagées

Le point dur n'est pas le principe du PIN — c'est **un PIN à 4 chiffres devant un compte `admin`** : 10 000 combinaisons protégeant un compte qui a `CRUD` sur tout, sur un poste en libre accès.

### (a) Tous les rôles basculent par PIN — **retenue, amendée**

Ergonomie maximale et uniforme. Défaut brut : le compte le plus puissant est protégé par le secret le plus faible.

### (b) La bascule exclut `admin`, qui se ré-authentifie par mot de passe

Le privilège élevé garde une preuve forte. **Rejetée** : elle coûte une gêne quotidienne à l'administrateur pour un gain que le contexte ne justifie pas — l'admin n'est pas le rôle du poste partagé, mais il est celui qui, en pratique, dépanne le poste pendant un brassage. Une friction quotidienne certaine contre un risque faible dans un local associatif fermé.

### (c) PIN pour tous, mais les actions sensibles re-demandent le mot de passe

Grain fin. **Rejetée** : il faudrait définir « sensible », puis maintenir cette définition à chaque milestone. Une liste d'exceptions qui vieillit mal est une surface d'erreur permanente — et l'oubli d'y inscrire une action nouvelle ne produit aucun signal.

> **Tranché par Ludo le 2026-07-20 — option (a) amendée : longueur différenciée.**
> **PIN à 4 chiffres pour tous les rôles ; 6 chiffres pour `admin`.** Motif : le poste est **ouvert mais l'environnement est contrôlé** (local associatif, appliance LAN-only, pas de public de passage).

## Décision

### 1. Modèle de menace — ce que les deux chiffres de plus protègent vraiment

Passer de 4 à 6 chiffres fait passer l'espace de 10 000 à 1 000 000 de combinaisons : un facteur 100 bien réel. **Mais contre une attaque en ligne, ce n'est pas ce qui protège.** Avec la temporisation décrite au §3, un attaquant obtient de l'ordre de quelques dizaines d'essais par heure : 10 000 combinaisons sont déjà hors de portée, et 1 000 000 ne change rien à une conclusion déjà acquise.

Les deux chiffres supplémentaires servent contre un **tout autre risque** : l'**observation par-dessus l'épaule**. Une saisie à 4 chiffres vue une fois se mémorise ; à 6 chiffres, sensiblement moins.

**Conséquence, écrite noir sur blanc : sur ce modèle de menace, le rate-limit et l'interdiction des PIN triviaux comptent davantage que la longueur.** Un PIN admin de 6 chiffres valant `123456` est plus faible qu'un PIN de 4 chiffres tiré au hasard. L'interdiction des suites triviales (§2) n'est donc **pas un raffinement optionnel : c'est la mesure principale**, et elle s'applique **aux deux longueurs**.

### 2. Le PIN lui-même

| Paramètre | Valeur |
|---|---|
| Longueur | **Exacte**, pas un plancher : **4** chiffres (tous rôles), **6** chiffres (`admin`) |
| Alphabet | **Chiffres 0–9 uniquement** (pavé numérique tactile) |
| Stockage | **Argon2id**, mêmes paramètres que les mots de passe. Jamais en clair, jamais journalisé, jamais restituable |

Longueur **exacte** et non plancher : elle permet à l'UI de valider dès le dernier chiffre saisi, sans bouton de confirmation — c'est ce qui rend la bascule réellement « 2 clics ». Un plancher obligerait à un « OK » supplémentaire à chaque relève.

**PIN interdits — vérifiés côté serveur.** La règle, pas une liste figée :

1. tous les chiffres identiques (`0000`, `111111`) ;
2. suite consécutive croissante ou décroissante (`1234`, `4321`, `123456`, `654321`) ;
3. motif répété (`1212`, `123123`) ;
4. année plausible, `1900`–`2099`, pour le PIN à 4 chiffres ;
5. à la réinitialisation : PIN identique au précédent.

Le contrôle est **serveur**. Un contrôle purement client se contourne avec l'outil de développement du navigateur, et cette règle est la mesure principale du modèle de menace — la placer côté client reviendrait à ne pas l'avoir.

### 3. Échecs, verrouillage, déblocage

> **Tranché par Ludo le 2026-07-20 — temporisation croissante à expiration automatique, avec levée admin possible.**

| Paramètre | Valeur |
|---|---|
| Seuil | **5** échecs dans une fenêtre glissante de **15 min** |
| Effet | Verrou **5 min**, puis **doublement** à chaque échec supplémentaire — 10, 20, **plafond 30 min** |
| Remise à zéro | Une saisie réussie, **ou** 60 min sans tentative |
| **Portée** | **Par utilisateur** |
| Déblocage | **Automatique** à l'expiration ; un **admin** peut lever le verrou immédiatement |

**Pourquoi jamais de blocage ferme.** Un blocage levable par le seul admin transforme cinq fautes de frappe en incident d'exploitation : un samedi de brassage, admin injoignable, l'utilisateur est hors-jeu jusqu'au lundi. La temporisation croissante rend le brute-force en ligne inopérant **sans jamais immobiliser personne**. La levée admin existe pour raccourcir l'attente, jamais comme unique issue — c'est la différence entre un confort et une dépendance.

**Portée par utilisateur — le risque écarté est le déni de service.** Un compteur par poste permettrait à quiconque de paralyser la tablette pour tout le monde en tapant faux cinq fois, y compris par maladresse. Le risque **accepté** en échange est le balayage des comptes un par un ; il est borné par la temporisation, qui s'applique à chaque compte indépendamment — un attaquant qui balaie dix comptes paie dix fois le même délai croissant.

### 4. Session, verrouillage automatique, sélecteur

| Paramètre | Valeur |
|---|---|
| Durée d'une session ouverte par **PIN** | **12 h** |
| Durée d'une session ouverte par **mot de passe** | 7 jours — **inchangé** (`apps/api/src/modules/auth/service.ts:8`) |
| Verrouillage automatique | **10 min** d'inactivité → retour au sélecteur d'utilisateur |
| Sélecteur | **Liste des comptes visible** |

12 h couvre une journée de brassage entière sans ressaisie et expire dans la nuit : le lendemain matin, le poste exige une authentification forte. Une session PIN de 7 jours reviendrait à convertir durablement une preuve faible en accès long — exactement ce qu'on cherche à éviter.

> **Tranché par Ludo le 2026-07-20 — le sélecteur affiche la liste des comptes.**
> C'est la condition de la bascule « 2 clics » du brief : exiger la saisie d'un identifiant sur tablette tactile à chaque relève rétablirait le frein que la fonctionnalité doit supprimer. L'énumération des comptes est donc **assumée** : dans un local associatif où tout le monde se connaît, sur une appliance LAN-only, la liste des bénévoles n'est pas un secret. Le sélecteur n'expose **que** le nom d'affichage — ni rôle, ni courriel, ni état de verrouillage.

### 5. Cycle de vie du PIN

- **Pose** : par l'utilisateur lui-même, depuis son profil, dans une session **authentifiée par mot de passe**. On ne pose pas un PIN depuis une session ouverte par PIN — sinon la preuve faible se régénère elle-même indéfiniment.
- **L'admin ne peut jamais lire un PIN.** Il est haché. L'admin peut **l'effacer** (le compte disparaît du sélecteur jusqu'à nouvelle pose) et **lever un verrou**. Il ne le consulte pas, ne le fixe pas, ne le communique pas.
- **Compte sans PIN** : **absent du sélecteur**. Il se connecte par la page de connexion habituelle, mot de passe. Une tuile inerte dans le sélecteur serait un cul-de-sac ; l'écran porte un lien « se connecter autrement » qui y mène.
- **Radiation d'un compte** : `pinHash` effacé et **toutes les sessions révoquées** dans la même transaction.

> **Tranché par Ludo le 2026-07-20 — promotion au rôle `admin` d'un compte porteur d'un PIN à 4 chiffres : renouvellement forcé à la prochaine bascule.**
> Le PIN à 4 chiffres reste valide ; à la bascule suivante, l'utilisateur doit poser un PIN à 6 chiffres avant d'accéder à sa session. La conséquence est assumée et décrite au §« Conséquences négatives ».

### 6. Traçabilité

Une session porte sa **méthode d'authentification** — `PASSWORD` ou `PIN` — et cette méthode est reportée dans le journal d'audit. Sans elle, une action tracée ne dirait pas avec quel niveau de preuve son auteur a été authentifié, ce qui ôterait à l'audit une partie de sa valeur : c'est précisément parce qu'on introduit une preuve plus faible qu'il faut pouvoir la distinguer après coup.

Événements journalisés (ressource `auditLog`, §3.5) :

- bascule **réussie** par PIN ;
- **échec** de saisie de PIN ;
- **verrouillage** déclenché, et **levée** de verrou (automatique ou par admin — l'admin est nommé) ;
- **pose** d'un PIN, **renouvellement**, **effacement** par un admin ;
- **refus** d'un PIN pour cause de trivialité — sans jamais journaliser la valeur refusée.

### 7. Ce que cet ADR n'autorise pas

La bascule par PIN ouvre une session avec **les droits du rôle de l'utilisateur, sans exception**. Elle ne crée aucune élévation, aucune dérogation à la matrice §3.5, aucun raccourci hors RBAC (voir ADR-12). Un utilisateur basculé par PIN a exactement les droits qu'il aurait eus par mot de passe — ni plus, ni moins longtemps qu'au §4.

## Conséquences

### Sur le schéma (M10-04, #295)

`User` gagne : `pinHash` (nullable — l'absence de PIN est un état normal), `pinUpdatedAt`, et les métadonnées de verrouillage (compteur d'échecs, début de fenêtre, échéance du verrou). La session gagne sa **méthode d'authentification**.

### Sur l'API (M10-06, #297)

Tous les nombres de cet ADR sont **posés** : 4 / 6 chiffres, 5 échecs, fenêtre 15 min, verrou 5 → 30 min, remise à zéro 60 min, session 12 h, inactivité 10 min. M10-06 écrit ses tests de rate-limit **sans avoir à choisir un seul nombre**. Les routes de bascule déclarent leur couple `(ressource, action)` comme toutes les autres.

### Sur l'UI (M10-09, #300)

Sélecteur listant les comptes **ayant un PIN**, nom d'affichage seul ; pavé numérique ; validation au dernier chiffre ; message de verrouillage indiquant **le temps restant** (et non « contactez un administrateur », qui serait faux) ; lien « se connecter autrement ».

### Sur les tests

Chaque valeur du §3 est asservie par un test : le 5ᵉ échec verrouille, le 4ᵉ non ; le verrou double ; il plafonne à 30 min ; il expire seul ; une saisie réussie remet le compteur à zéro. Les PIN triviaux sont refusés **côté serveur** pour les deux longueurs. Et un test de **non-régression de privilège** : une session ouverte par PIN ne donne pas un droit qu'une session mot de passe n'aurait pas.

### Conséquences négatives assumées

- **À privilège égal, une session ouverte par PIN offre une garantie d'identité plus faible qu'une session par mot de passe.** Les mesures compensatoires — session courte, verrouillage, temporisation, audit distinct, PIN triviaux interdits — **ne suppriment pas ce fait, elles le bornent**. Un ADR qui prétendrait l'inverse serait faux, et c'est exactement le genre de faux confort qu'ADR-11 nous apprend à refuser ailleurs.
- **La fenêtre d'exposition ouverte par la promotion au rôle `admin` n'est pas bornée dans le temps.** Le renouvellement se déclenche à la prochaine bascule ; un administrateur qui ne bascule jamais conserve un PIN à 4 chiffres indéfiniment, ce qui vide de son effet la différenciation actée au §1 pour ce compte précis. C'est le prix du choix retenu — invalider le PIN à la seconde de la promotion l'aurait fermée, au prix d'un compte brutalement retiré du sélecteur sans préavis.
- **Les comptes ayant un PIN sont énumérables** depuis l'écran de bascule, sans authentification préalable sur ce poste.
- **Deux durées de session coexistent** (12 h et 7 jours) : toute évolution de la gestion de session devra traiter les deux cas, et un test qui n'en couvrirait qu'un laisserait passer une régression sur l'autre.
