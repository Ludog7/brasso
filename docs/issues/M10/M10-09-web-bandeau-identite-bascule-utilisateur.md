---
labels: web, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-09 — web : bandeau — identité de la brasserie, badge de l'utilisateur actif, bascule par PIN

## Contexte
Le bandeau actuel (`apps/web/src/routes/AppShell.tsx`) affiche « Brasso » en dur et un bouton de déconnexion. Il ne porte ni l'identité de la brasserie, ni l'indication de **qui** est connecté — ce qui, sur un poste partagé où l'on se relaie, est le manque le plus gênant : rien ne dit au brasseur suivant sous quel compte il agit.

Ce ticket livre les deux moitiés du critère de démo M10 : l'**identité appliquée partout**, et la **bascule d'utilisateur en 2 clics** avec badge permanent.

⚠️ `HomePage` porte aujourd'hui **son propre en-tête**, dupliqué de celui d'`AppShell` (nom + bouton de déconnexion). Deux bandeaux à faire évoluer là où il devrait y en avoir un : le traiter, sinon l'identité s'appliquera à un écran sur deux.

SOURCE : epic M10 (critère de démo) ; ADR-13 ({{M10-02}}) ; ADR-12 ({{M10-01}}) pour la lecture publique.

## Objectif
Sur n'importe quel écran, on voit **de quelle brasserie** il s'agit et **qui** est connecté, et on change d'utilisateur en deux clics et une saisie de PIN.

## Périmètre technique
- `apps/web/src/routes/AppShell.tsx` et l'en-tête dupliqué de `HomePage.tsx` — **à unifier**.
- `apps/web/src/features/auth/` : sélecteur d'utilisateur et saisie du PIN.
- Consomme les primitives de {{M10-07}} et l'API de {{M10-06}}.
- Hors périmètre : la bascule de thème ({{M10-11}}), le volet Options ({{M10-08}}).

## Spécification

**A. Unifier les deux bandeaux.** `HomePage` doit utiliser `AppShell` comme les autres écrans, ou l'en-tête doit devenir un composant unique. Livrer l'identité sans traiter la duplication produirait deux bandeaux divergents — exactement la dette que {{M10-10}} vient de payer sur les couleurs.

**B. Identité.** Logo et nom de la brasserie, lus depuis `options` ({{M10-05}}). Comportements à tenir : instance **non configurée** (pas de logo, pas de nom) → repli neutre, jamais un bandeau cassé ni un espace vide ; **hors ligne** → l'identité déjà connue s'affiche, elle n'attend pas le réseau (ADR-08).

L'écran de **connexion** affiche également nom et logo (ADR-12, arbitrage du 2026-07-20), via la route **publique** bornée à trois champs.

**C. Badge de l'utilisateur actif — permanent.** Visible **en permanence**, sur tous les écrans, y compris le Jour J en plein écran. C'est ce qui empêche d'agir sous le compte de quelqu'un d'autre sans s'en apercevoir. Afficher le nom et le(s) rôle(s) — le rôle affiché suit le libellé de {{M10-08}} : `caisse` → « **Trésorier / Caisse** ».

**D. Bascule en 2 clics.** Sélecteur d'utilisateur → saisie du PIN. Contraintes issues d'ADR-13 :

- Le **format** de saisie suit la longueur : **4 chiffres**, **6 pour `admin`**. Pavé numérique adapté au tactile (cible ≥ 48 px, §6).
- L'affichage du sélecteur (liste des utilisateurs ou saisie) suit ce qu'**ADR-13 a tranché** sur l'énumération — ne pas re-décider ici.
- **Messages non divulgants** : un échec ne dit ni quel élément est faux, ni combien d'essais restent. Le message est **constant**, et l'UI ne doit pas trahir par un compteur ce que l'API refuse de dire.
- **Compte bloqué** : état lisible et actionnable — dire quoi faire, sans révéler la mécanique du blocage.
- Le **verrouillage automatique** ramène au sélecteur ; le travail en cours ne doit pas être perdu en silence.

**E. Offline-first.** La bascule exige le réseau (elle ré-authentifie). Hors ligne, elle est **indisponible et le dit** — jamais un formulaire qui accepte la saisie pour échouer ensuite. Le reste du bandeau, lui, continue de fonctionner.

## Definition of Done
- [ ] **Un seul** bandeau : la duplication `HomePage` / `AppShell` a disparu
- [ ] Logo et nom affichés sur **tous** les écrans authentifiés, **et** sur l'écran de connexion via la route publique
- [ ] Instance non configurée → **repli neutre** ; hors ligne → identité connue affichée sans attente réseau
- [ ] Badge de l'utilisateur actif **visible en permanence**, Jour J plein écran compris
- [ ] Le rôle `caisse` s'affiche « **Trésorier / Caisse** » (clé inchangée)
- [ ] Bascule en **2 clics** + saisie ; longueur **4 / 6 pour `admin`** ; cibles tactiles ≥ 48 px
- [ ] Messages d'échec **constants et non divulgants** ; aucun compteur d'essais affiché
- [ ] État « compte bloqué » lisible et actionnable, sans révéler la mécanique
- [ ] Verrouillage automatique ramenant au sélecteur **sans perte de travail silencieuse**
- [ ] Hors ligne : bascule **annoncée indisponible**, jamais un formulaire qui échoue après coup
- [ ] Tests montés **par `App` et sa route**, couvrant bascule réussie, PIN faux, compte bloqué et hors ligne
- [ ] Primitives de {{M10-07}} utilisées ; Prettier passé ; CI verte
- [ ] Critère observable : **critère de démo M10 atteint** — identité appliquée partout, bascule en 2 clics avec badge permanent

## Dépendances
Bloqué par : {{M10-05}} (identité), {{M10-06}} (API de bascule), {{M10-07}} (primitives) — Bloque : rien. **Porte le critère de démo du milestone.**
