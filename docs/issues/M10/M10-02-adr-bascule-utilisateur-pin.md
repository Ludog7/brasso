---
labels: adr, docs, api, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-02 — adr : ADR-13 « bascule d'utilisateur par PIN sur poste partagé » (amende ADR-10)

## Contexte
Le premier test d'usage a montré le besoin d'un poste d'atelier **partagé** : plusieurs personnes se succèdent sur la même tablette et ressaisir un mot de passe complet à chaque relève est un frein réel. Le brief demande une bascule d'utilisateur « en 2 clics » avec code PIN.

ADR-10 fixe le modèle d'authentification (session cookie, Argon2id, RBAC maison). Un PIN à 4-6 chiffres est un **second facteur d'authentification bien plus faible** qu'un mot de passe : il touche donc ADR-10 et exige un ADR (`docs/adr/README.md` : « modifie le modèle d'authentification » ⇒ ADR requis).

Il faut nommer le compromis sans le maquiller : **on abaisse volontairement le niveau d'authentification pour gagner en ergonomie**. §9.2 Q5 pose déjà les garde-fous non négociables — PIN haché Argon2id, jamais en clair, défini par l'utilisateur, réinitialisable par l'admin, session courte, verrouillage automatique, **rate-limit et blocage après N échecs**. Cet ADR les chiffre et les rend opposables. SOURCE : SPEC-ORCHESTRATION §0 (ADR-10), §9.2 (Q5), §9.3 ; `docs/briefs/DEV-STEP-2.md`.

## Objectif
`docs/adr/ADR-13-bascule-utilisateur-pin.md` existe, statut **Acceptée**, et fixe des paramètres **chiffrés** (longueur, seuils, durées) directement transposables en tests par M10-06 — aucun nombre ne reste à l'appréciation de l'implémenteur.

## Périmètre technique
- Fichiers concernés : `docs/adr/ADR-13-bascule-utilisateur-pin.md` (nouveau) ; `docs/adr/README.md` (index) ; `docs/SPEC-ORCHESTRATION.md` §0 (mention de renvoi sur la ligne ADR-10, **sans la réécrire**) ; `docs/SPEC-FONCTIONNELLE.md` si le parcours de bascule doit y être décrit.
- Hors périmètre explicite : **tout code et tout schéma**. `User.pinHash` et ses métadonnées de verrouillage sont portés par M10-04 (migration), la mécanique par M10-06 (API) et M10-09 (UI).

## Spécification

**A. Le point dur — un PIN à 4 chiffres devant un compte `admin`.**
10 000 combinaisons protégeant un compte qui a `CRUD` sur tout, sur un poste en libre accès à l'atelier : c'est le vrai risque de cette fonctionnalité, et il ne se règle pas par le seul rate-limit. À trancher explicitement :

| Option | Principe | Coût / risque |
|---|---|---|
| **(a)** Tous les rôles basculent par PIN | Ergonomie maximale, uniforme | Le compte le plus puissant est protégé par le secret le plus faible |
| **(b)** La bascule par PIN **exclut `admin`** : l'admin se ré-authentifie par mot de passe | Le privilège élevé garde une preuve forte | Une gêne réelle pour l'admin — mais il n'est pas le rôle du poste partagé |
| **(c)** PIN pour tous, mais les **actions sensibles** re-demandent le mot de passe | Grain fin | Il faut définir « sensible » — surface d'erreur large, à maintenir dans le temps |

**Recommandation à instruire : (b)**, éventuellement complétée de (c) pour les actions RGPD. Motif : le poste partagé est un poste d'**atelier** ; y rendre l'administration accessible en 4 chiffres apporte peu et coûte cher.

**B. Paramètres à chiffrer** — chacun doit sortir de l'ADR avec une **valeur**, pas une fourchette :

- **Longueur du PIN** : 4, 5 ou 6 chiffres ? Longueur fixe ou plancher ? Chiffres seuls ou alphanumérique ?
- **PIN interdits** : refuse-t-on les suites triviales (`0000`, `1234`, `1111`, date de naissance) ? Si oui, la liste ou la règle.
- **Seuil de blocage `N`** et **fenêtre** : N échecs en combien de temps ?
- **Effet du blocage** : temporisation croissante ou blocage ferme ? Durée ? Et surtout — **qui débloque** : expiration automatique, ou intervention admin ? (Un blocage ferme sans admin joignable un samedi de brassage immobilise le poste : le nommer.)
- **Portée du blocage** : par **utilisateur**, par **poste**, ou les deux ? Un blocage par utilisateur seul permet de balayer les comptes un par un ; un blocage par poste seul permet de bloquer autrui par déni de service. Trancher en connaissance de cause.
- **Durée de session** issue d'une bascule PIN : plus courte qu'une session mot de passe — combien ?
- **Verrouillage automatique** : après quelle durée d'inactivité l'écran revient-il au sélecteur d'utilisateur ?
- **Énumération** : le sélecteur affiche-t-il la **liste des utilisateurs** (2 clics, mais expose qui a un compte) ou exige-t-il une saisie ? Sur une appliance LAN-only l'exposition est faible — le décider quand même.

**C. Traçabilité.**
Une session ouverte par PIN doit être **distinguable** d'une session ouverte par mot de passe dans le journal d'audit (ressource `auditLog`, §3.5). Sans quoi une action tracée ne dira pas avec quel niveau de preuve l'utilisateur a été authentifié. Écrire aussi ce qui est journalisé : bascules réussies, échecs, blocages, poses et réinitialisations de PIN.

**D. Cycle de vie du PIN.**
Pose par l'utilisateur dans son profil ; réinitialisation par l'admin (qui **ne peut pas le lire** — il est haché, l'admin le supprime ou en force le renouvellement, il ne le consulte jamais) ; que se passe-t-il pour un utilisateur **sans** PIN (invisible du sélecteur, ou présent mais exigeant un mot de passe ?) ; que devient le PIN à la radiation d'un compte.

**E. Ce que l'ADR doit assumer par écrit.**
La conséquence négative, nommée : à privilège égal, une session ouverte par PIN offre une **garantie d'identité plus faible** qu'une session par mot de passe. Les mesures compensatoires (session courte, verrouillage, rate-limit, blocage, audit distinct, exclusion de l'admin) ne suppriment pas ce fait, elles le bornent. Un ADR qui prétendrait l'inverse serait faux — et c'est exactement le genre de faux confort qu'ADR-11 nous apprend à refuser ailleurs.

## Definition of Done
- [ ] `docs/adr/ADR-13-bascule-utilisateur-pin.md` créé au gabarit du README, statut **Acceptée**, date, n° d'issue, champ « Amende » = **ADR-10**
- [ ] La question « PIN et compte `admin` » est tranchée, les trois options écrites, le rejet motivé
- [ ] **Chacun** des paramètres de la section B sort avec une **valeur chiffrée** (aucune fourchette, aucun « à définir »)
- [ ] La portée du blocage (utilisateur / poste) est tranchée en nommant le risque écarté
- [ ] Le mode de **déblocage** est écrit, y compris le cas « admin non joignable »
- [ ] La distinction PIN / mot de passe dans le journal d'audit est spécifiée, avec la liste des événements journalisés
- [ ] Le cycle de vie du PIN est écrit (pose, réinitialisation sans lecture possible, absence de PIN, radiation)
- [ ] La conséquence négative est **assumée par écrit**, sans euphémisme
- [ ] `docs/adr/README.md` : index à jour (ADR-13 → **Acceptée**)
- [ ] `SPEC-ORCHESTRATION.md` §0 porte une mention de renvoi depuis ADR-10 — la ligne d'origine n'est pas réécrite
- [ ] Critère observable : M10-04 connaît les champs à migrer et M10-06 peut écrire ses tests de rate-limit **sans choisir un seul nombre lui-même**

## Dépendances
Bloqué par : validation de la démo M9 — Bloque : {{M10-04}} (champs `User.pinHash` + verrouillage), {{M10-06}} (API de bascule), {{M10-09}} (UI de bascule + badge)
