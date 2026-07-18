# Brief — Dev Step 2 (Brasso)

> **Destinataire : Fable 5 (planificateur).** Ce document n'est PAS un plan : c'est le **cahier d'inputs consolidé** issu d'une session de test réelle de l'app + atelier de cadrage avec Ludo (2026-07-18). Ta mission : le transformer en **plan détaillé** (milestones + epic + sous-tickets), en respectant scrupuleusement les conventions du repo.
>
> **À lire avant de planifier** : `CLAUDE.md` (règles non négociables), `docs/DEV.md` (carte repo/build/CI), `docs/SPEC-ORCHESTRATION.md` (ADR figés §0, milestones), `docs/SPEC-FONCTIONNELLE.md` (métier), `docs/FORMULES-BRASSICOLES.md` (formules — fait foi), `docs/patterns/editeur-moteur-recette.md`.

---

## 0. Contexte projet

- **État** : M0→M8 tous livrés (go-live sous réserve des gates réglementaires REG-01 NF525 / REG-02, qui sont des actes externes). Ce lot « **dev step 2** » = évolutions **post-go-live** issues du premier vrai test d'usage.
- **Verdict utilisateur sur l'existant** : *« globalement assez basique et peu esthétique. On a la trame globale mais il y a gros à faire encore. »* → au-delà des demandes ponctuelles ci-dessous, il y a un **objectif transverse de montée en qualité UX/design** (cohérence visuelle, responsive, états vides, lisibilité).
- **Numérotation** : le prochain jalon logique est **M9+**. Le découpage exact (nombre de milestones, frontières) est **à ta main**, en suivant la maille habituelle : 1 epic + sous-tickets `M<n>-<xx>` dans `docs/issues/M<n>/`.
- **Consigne de cadence (maintenue)** : **checkpoint + feu vert utilisateur après chaque ticket**. À intégrer dans le plan comme mode opératoire.

---

## 1. Contraintes non négociables à respecter dans le plan

Le plan et chaque ticket doivent honorer ces règles (rappel de `CLAUDE.md` — ne pas les ré-arbitrer) :

- **1 ticket = 1 branche (`feat/<n°>-<slug>`) = 1 PR** avec `Closes #`. Jamais de commit direct sur `main` (protégée, squash-merge, CI verte requise).
- **ADR §0 figés** : toute remise en cause d'un ADR ⇒ ticket `type:adr` + fichier `docs/adr/`. (⚠️ plusieurs items ci-dessous touchent des ADR — voir §5.)
- **Formules** : **aucune formule écrite de mémoire.** Toute nouvelle formule (règle levure sèche, carbonatation soda keg, durée de garde par défaut, âge…) s'écrit **d'abord** dans `docs/FORMULES-BRASSICOLES.md` (avec valeurs de référence), **puis** dans `packages/core` avec tests contre ces valeurs.
- **Tests core** : tout code `packages/core` testé, **couverture 100 % imposée en CI**.
- **Unités internes** : g, L, °C, SG brute, EBC, acides alpha en fraction, bar, **centimes** pour la monnaie. Toutes conversions dans `packages/core/src/units.ts` **uniquement**.
- **ADR-11 (wording sécurité alimentaire)** : écrans pH/stabilisation/assainissement ⇒ « **indicateur** d'aide à la décision », **jamais** « conforme »/« sûr ». Disclaimer permanent. → **impacte le nouveau step « clean refroidissement »** (stérilisation) : formuler en indicateur, pas en garantie sanitaire.
- **Migrations Prisma append-only** : ne jamais modifier une migration mergée ⇒ nouvelle migration.
- **Recette `PUBLISHED` immuable** : l'éditer crée un `DRAFT` n+1 (ADR-06/07). Un batch fige `recipeSnapshot` (JSONB) ; lectures **défensives** (cf. `buildPlan.ts`).
- **RBAC deny-by-default** : toute nouvelle route API déclare son couple `(ressource, action)`. Toute nouvelle ressource (brassins-cycle, produits finis, tâches, events, options, champs membres) ⇒ entrées dans la matrice RBAC (§3.5 spec). Réconcilier avec la demande « accès paramétrables par rôle » (§3.B).
- **Sécurité** : Argon2id, cookies `httpOnly/secure/sameSite`, rate-limit, secrets en env, webhooks signés. → **le code PIN du switch-user suit le même standard** (hash Argon2id, jamais en clair).
- **Offline-first / PWA / auto-hébergé** : les nouveautés « en ligne » (météo, emails) sont **optionnelles, configurables dans Options, à dégradation gracieuse** (cf. §2 décision D4).
- **Poste** : Windows/PowerShell ; scripts d'automatisation en bash Git-Bash. DB locale de dev sur **port 5433**.

---

## 2. Décisions verrouillées (atelier de cadrage)

| # | Sujet | Décision |
|---|-------|----------|
| **D1** | **Priorité #1** | **Chantier A — Boucle brassin complète** est le premier à planifier (cœur métier actuellement incomplet/cassé). |
| **D2** | **Switch user** | **Bascule rapide type caisse** : poste partagé, plusieurs comptes du même établissement, bascule en 2 clics + **ré-auth par code PIN**, **badge user actif** permanent dans le bandeau, session courte + verrouillage auto. |
| **D3** | **Agenda** | **Module interne** (socle, offline-first) alimenté par brassins/events/tâches, **+ export `.ics` / synchro externe en opt-in non bloquant**. |
| **D4** | **Services en ligne (météo, emails)** | **Autorisés mais optionnels** : activables/configurables **dans le panneau Options générales** (feature flags + config). Non configuré ou hors-ligne ⇒ dégradation gracieuse (tuile masquée / envoi désactivé). |

**Décisions déléguées par l'utilisateur (« à trancher ») — recommandations retenues, Fable peut challenger avec justification :**

- **Masse thermique** : **conserver** (elle **sert** au calcul des rampes de chauffe, cf. `buildPlan.ts::estimateRampMin`), mais la **reléguer derrière un mode « avancé/expert »** du formulaire équipement + libellé pédagogique. Ne pas supprimer.
- **Audit** : **conserver mais restreindre à l'admin** + créer un **ticket d'étude dédié** pour définir sa valeur réelle (KPI, cas d'usage) avant tout élargissement. Ne pas supprimer à l'aveugle.
- **Libellé « volume mort » → « perdu »** : changement d'**intitulé UI uniquement** ; la clé interne `deadspaceL` reste inchangée (pas de migration).
- **« Styles DJCP »** = interprété comme **BJCP** (Beer Judge Certification Program) : menu **familles → sous-familles**, catalogue à **seeder** en données de référence.
- **Code hexa de la couleur de recette** : **calcul conservé mais masqué** dans l'éditeur ; **exposé pour le futur panneau d'affichage de vente** (intégration à prévoir dans le chantier Cartes/écrans).

---

## 3. Exigences détaillées par domaine

> Chaque bloc = **intention → détails → ancrages code → points d'attention**. Les ancrages sont vérifiés sur le repo au 2026-07-18 ; confirme-les au moment de planifier.

### 3.A — BOUCLE BRASSIN *(PRIORITÉ #1, D1)*

> **Constat structurant** : aujourd'hui le « Jour J » (state machine) **s'arrête à l'ensemencement** (`PITCHING`). Les types `WHIRLPOOL`, `STABILIZE`, `CONDITION`, `PACKAGE` sont **explicitement ignorés** (`mapStep` → `default: return null`, cf. `packages/core/src/stateMachine/buildPlan.ts:244`). Ce chantier **étend le cycle de vie du brassin au-delà du Jour J** : fermentation → dry hop → cold crash → garde → conditionnement → **stock produits finis**.

**3.A.1 — Carte / vue « Brassins » (nouvelle)**
- Vue listant **brassins passés et en cours**, avec **suivi des dates** (début, étape courante, prochaine échéance, fin prévue).
- **Point d'entrée vers les brassins créés depuis les recettes** (un brassin naît d'une recette publiée → `recipeSnapshot`).
- Accès au détail Jour J / cycle depuis cette carte.

**3.A.2 — State machine Jour J : corrections & nouveaux steps**
- **BUG** : sur les **étapes sans timer** (ex. filtration `LAUTER`), **pas de bouton « next step »** dans « forcer l'étape » → impossible d'avancer. Fournir une **validation manuelle** pour toute étape sans timer.
- **BUG** : après **validation du refroidissement**, **pas de passage au step suivant**. Correctif : si température OK → avancer ; sinon **consigner températures + timing jusqu'à l'ensemencement**.
- **Alertes houblonnage** : garantir des **alertes pour ajouts amérisants / aromatiques** et pour le **hors-flamme** (flame-out) pendant l'ébullition (non testé faute de temps → à fiabiliser + couvrir de tests).
- **Nouveau step « clean refroidissement »** : faire circuler le moût en ébullition pour **stériliser le circuit de refroidissement**, **~5 min avant le hors-flamme**. ⚠️ **Wording ADR-11** (indicateur, pas « stérile/conforme »).
- **Nouveau step « Whirlpool »** : réintégrer `WHIRLPOOL` dans le périmètre Jour J (aujourd'hui droppé).
- Ancrages : `buildPlan.ts` (mapping `RawStep`→`StepSpec`, enum `DayPhase`, `phaseToDayPhase`), `plan.ts`, `types.ts`, transition/`initDayState` (M1-13), enum Prisma `DayPhase` (`packages/db/prisma/schema.prisma`). Ajout de phases/steps ⇒ **nouvelle migration** + miroir enum core↔Prisma + snapshots rétro-compatibles (lecture défensive).

**3.A.3 — Fin d'ensemencement : durées prévisionnelles + agenda**
- À la **validation de l'ensemencement**, saisir les **durées prévues** : **fermentation**, **dry hop** (si présent dans la recette), **cold crash**, **garde** (proposition par défaut **21 j**, ajustable).
- Calcul des **dates** correspondantes → **implémentation dans l'agenda interne** (D3).
- La **durée de garde par défaut** = valeur métier ⇒ à documenter dans `FORMULES-BRASSICOLES.md` (§5).

**3.A.4 — Volumes**
- Manque les **volumes en fin de brassin** : ajouter des **prises de volume sur les étapes clés** + un **volume final produit**.
- Note : `buildPlan` pose déjà `requiredMeasurements: ["density","volume"]` sur `LAUTER` → étendre la capture de volumes aux étapes clés et matérialiser le **volume final** (qui alimente le rendement et le stock produits finis).

**3.A.5 — Conditionnement → stock produits finis** *(pièce maîtresse)*
- Aujourd'hui : passage en **étape conditionnement** mais **aucun suivi des quantités conditionnées par type de contenant** ⇒ **pas de stock produits finis**.
- Cible : à l'étape conditionnement, **saisir les quantités par type de contenant** (bouteilles, fûts, bouteilles mécaniques réutilisables…) → **génère/incrémente le stock de produits finis** (bières & softs).
- **Réconcilier** avec : le module **Stock** (§3.J — famille « produits finis » ou store dédié — voir Q10 §5), et le **hub caisse M7** (une vente décrémente déjà le stock — les produits finis conditionnés doivent devenir les articles vendables des cartes/écrans, cf. §3.I).

---

### 3.B — APPARENCE & OPTIONS GÉNÉRALES *(socle transverse)*

- **Nouveau volet « Options générales »** applicable à toute l'app, contenant les sous-volets ci-dessous.
- **Sous-volet « Apparence »** :
  - **Fond clair** par défaut (l'app est jugée trop basique/terne).
  - **Couleur de marque** ⇒ dérive une **couleur de contraste** pilotant lignes et tonalités de l'app (thème dérivé d'une seule couleur).
  - **Logo de la brasserie** + **nom de l'asso/brasserie** dans le **bandeau**.
  - **Choix mode sombre / clair**.
- **Sous-volet « Accès »** : **paramétrage des accès par type de profil** — **admin, brasseur, trésorier, RGPD**. ⚠️ à **réconcilier avec la matrice RBAC existante** (§3.5 spec) — voir Q9 §5.
- **Sous-volet « Services »** : toggles + config **météo** et **emails** (D4).
- **Sous-volet « Templates »** : templates réutilisables pour **cartes du bar & écrans d'affichage** (§3.I).
- **Bandeau / global** : **switch user + badge user actif** (D2, modèle caisse + PIN).

---

### 3.C — ÉQUIPEMENT

- **Types de matériel manquants** : **embouteillage**, **fermenteurs** (le profil actuel est orienté cuve de brassage). → introduire une notion de **catégories/types d'équipement** plus large.
- **« volume mort » → libellé « perdu »** (UI only).
- **Chauffe** : ajouter un **sélecteur « Gaz / électrique »**.
- **Masse thermique** : **mode avancé/expert** (décision §2).
- Ancrages : `packages/core/src/schemas/equipment.ts` (`deadspaceL`, `heatingPowerKw`, `thermalMassKjPerC`), `apps/web/src/features/equipment/EquipmentProfileForm.tsx`, `apps/api/src/modules/equipment/repository.ts`. Nouveaux champs (type chauffe, catégorie matériel) ⇒ schéma Zod core + **migration Prisma**.

---

### 3.D — RECETTES

- **BUG (réactivité)** : l'onglet **« Prévision »** n'apparaît **qu'après** saisie d'un champ → doit apparaître **dès l'ouverture** du panneau recette. Il **n'évolue pas en direct** au fil de la saisie **OG / FG / ABV**, et le **patch couleur** ne se met pas à jour non plus → rendre le panneau **réactif temps réel**.
- **Code hexa couleur** : **ne pas afficher** dans l'éditeur (garder « off »), **le récupérer pour le panneau d'affichage de vente** (§3.I).
- **Levure** : gérer **levure liquide OU sèche**. Si **sèche** : **quantité prévue** + **règle volume brassin → quantité de levure sèche** (formule ⇒ `FORMULES-BRASSICOLES.md`, §5, Q2).
- **Styles BJCP manquants** : **menu familles → sous-familles** (catalogue seedé).
- Ancrages : `apps/web/src/features/recipes/{beer,alt,soft}/` (`StepsEditor`, `IngredientsEditor`, `mapToEngine.ts`, `labels.ts`), `packages/core/src/schemas/recipeParts.ts`, `enums.ts`, `docs/patterns/editeur-moteur-recette.md`. Ajout type levure/quantité ⇒ schéma + **migration** + compat `recipeSnapshot`.

---

### 3.E — CALCULATEUR

- **Manque la carbonatation pour soda keg** → à implémenter (formule ⇒ `FORMULES-BRASSICOLES.md`, §5, Q3).
- Ancrages : `packages/core/src/calculators/` (`biab.ts` et voisins), `packages/core/tests/calculators/`.

---

### 3.F — MEMBRES

- **N° adhérent** : proposer **+1 du dernier numéro utilisé** (incrément auto, modifiable).
- **Champ majeur / mineur** (conso alcool).
- **Date de naissance** : afficher l'**âge** en dessous (vs date du jour).
- **Adresse détaillée** : champs **rue, ville, code postal** (remplacer l'adresse actuelle mono-champ).
- **Champ photo** (facultatif). ⚠️ stockage + **RGPD/consentement/rétention** (Q8 §5).
- **Opt-in email** (invitations events, communications) : à l'inscription, si coché → **envoi mail de validation d'adresse + opt-in newsletter** (double opt-in). **Sans réponse ⇒ adhésion en JAUNE** dans la liste. (dépend de D4 emails.)
- **Logique de statut couleur** (liste membres) :
  - **VERT** : adhésion complète **et** à jour.
  - **JAUNE** : email non validé / opt-in en attente.
  - **ORANGE** : **1 mois avant** la fin d'adhésion (adhésion **valable 12 mois**).
  - **ROUGE** : hors date.
- **Acquittement cotisation + date anniversaire d'adhésion** : aujourd'hui un membre créé est marqué « en retard » **sans champ d'acquittement ni date anniversaire** → ajouter ces champs et la **logique d'échéance 12 mois**.
- **Responsive** : soigner la **lisibilité du panneau membre selon la taille d'écran/fenêtre**.
- Ancrages : modules Membres **M6** (schéma + RBAC déjà en place depuis M1) — voir `apps/api/src/modules/` + `apps/web/src/features/` (localiser `members`). Statut « dérivé de la période » = décision M6 déjà actée (cf. mémoire M6).

---

### 3.G — COTISATIONS

- **BUG/logique** : le volet **Cotisation est vide même après création d'un membre** → **revoir la logique de liaison avec le volet Membres** (et les remarques §3.F).
- **Conserver ce volet** pour l'**administration & le suivi des cotisations**.
- Ancrages : modules **M6** cotisations (rapprochement auto email + manuel, webhook HelloAsso HMAC déjà en place).

---

### 3.H — AUDIT

- Valeur actuelle jugée peu claire. Décision §2 : **conserver mais admin-only** + **ticket d'étude** de la valeur (à cadrer avant tout élargissement).

---

### 3.I — CARTES DU BAR / ÉCRANS D'AFFICHAGE

- **Les produits ajoutables doivent être les boissons finies** (produits finis conditionnés), **pas les fournitures** (bouteilles, capsules…). → dépend directement de **3.A.5 (stock produits finis)**.
- **Templates** de cartes & écrans **dans Options générales** (§3.B) — avec injection **logo / nom / couleur de marque** et **code hexa couleur des recettes** (§3.D).
- Ancrages : modules **M7** (hub caisse, écran bar plein écran temps réel, exports CSV).

---

### 3.J — STOCK

- **N'afficher que les produits effectivement en stock** (masquer stock nul).
- **Champ de recherche** pour retrouver l'article lors de l'ajout.
- **Familles de stock** (avec possibilité d'**ajouter types & familles**) :
  - **Matières premières** (grain, houblons, levure, irish moss…)
  - **Conditionnement** (bouteilles, fûts, capsules… **incl. bouteilles mécaniques réutilisables**)
  - **Divers** (CO2, nettoyants…)
  - *(+ produits finis — voir Q10 §5 : famille dédiée ou store séparé.)*
- Ancrages : modules **M5** (stock complet, décrément au volume réel, coût de revient).

---

### 3.K — TABLEAU DE BORD *(écran d'accueil permanent)*

- Affichage **permanent** sur l'écran d'accueil, **boutons de fonctions en dessous**. Tuiles :
  1. **Prochain event / ouverture** (source : agenda/events).
  2. **Volume brassé sur l'année**.
  3. **Nombre de brassins en cours + date du next step**.
  4. **Stock restant en produits finis** (bières & softs, selon produits finis existants).
  5. **Météo du jour** (D4, optionnelle, dégradée si off/hors-ligne).
  6. **Tâches à échéance proche**.
- **Dépendances** : nécessite 3.A (brassins/volumes/produits finis), 3.L (tâches), 3.M (agenda/events) → **planifier après** ces briques.

---

### 3.L — VOLET TÂCHES *(nouveau)*

- Tâches de la **vie de l'asso** et du **brassage**. Champs :
  - **Type** : admin / Brassage / Orga / divers.
  - **Responsable** (sélection utilisateur).
  - **Échéance**.
  - **Description**.
- Alimente le tableau de bord (tuile 6) et l'agenda (§3.M).

---

### 3.M — AGENDA *(transverse, D3)*

- **Module interne** (offline-first) agrégeant : **dates de brassin** (fermentation, dry hop, cold crash, garde), **events/ouvertures**, **échéances de tâches**.
- **Export `.ics` + synchro externe en opt-in** non bloquant.
- Source des events pour la tuile « prochain event » du dashboard.

---

## 4. Objectif transverse : montée en qualité UX

Au-delà des demandes ponctuelles, l'utilisateur juge l'app « basique et peu esthétique ». Le plan doit intégrer, en fil rouge (pas forcément un milestone isolé) :
- cohérence du **design system** (shadcn/ui + Tailwind 4 déjà en place) : espacements, typographie, composants réutilisés ;
- **états vides / chargement / erreurs** soignés ;
- **responsive** systématique (rappel explicite pour le panneau Membres) ;
- thème piloté par la **couleur de marque** (§3.B) appliqué de façon homogène.

---

## 5. Questions ouvertes à résoudre AVANT de figer le plan

> Défauts proposés entre crochets — à confirmer par l'utilisateur ou à arbitrer par Fable. Plusieurs **conditionnent des ADR / formules** et doivent être tranchés tôt.

1. **BJCP** — version & langue du catalogue ? *[proposé : BJCP 2021, familles→sous-catégories, libellés EN + glose FR, données de référence seedées ; vérifier la licence de redistribution des données.]*
2. **Règle levure sèche** (volume brassin → quantité) — référence exacte ? *[à sourcer puis écrire dans `FORMULES-BRASSICOLES.md` AVANT code ; ex. taux g/L + viabilité sèche vs liquide. Bloquant pour §3.D.]*
3. **Carbonatation soda keg** — formule de référence (volumes CO2 ↔ pression/température) ? *[à sourcer + documenter avant code. Bloquant pour §3.E.]*
4. **Garde par défaut 21 j** — confirmer la valeur et la plage ajustable *(à documenter en formule/param métier).*
5. **PIN switch-user** — stockage (Argon2id, comme mots de passe), TTL session, verrouillage auto, où se règle le PIN (profil utilisateur) ? *[proposé : PIN hashé Argon2id, session courte, auto-lock, PIN défini par l'utilisateur. Touche l'auth — vérifier si ADR auth à amender.]*
6. **Météo** — fournisseur ? *[proposé : **Open-Meteo** (sans clé, gratuit) + lat/lon en config Options, pour rester keyless et dégradable.]*
7. **Emails sortants** — fournisseur/SMTP, flux double opt-in (token), gestion des bounces ? *[à cadrer : SMTP en secrets env, token de validation, statut jaune si non validé.]*
8. **Photo membre** — stockage (blob local / objet), **rétention & consentement RGPD** ? *[proposé : stockage local, consentement explicite, purge à la radiation.]*
9. **« Accès paramétrables par rôle »** — matrice **éditable en UI** ou **presets fixes par rôle** ? Comment s'articule-t-elle avec la **matrice RBAC §3.5** existante (deny-by-default) ? *[proposé : presets par rôle alignés RBAC + réglage fin admin-only en v2. Ne pas contourner le deny-by-default.]*
10. **Stock produits finis** — **nouvelle famille dans le module Stock M5** ou **store dédié** ? Comment les produits finis conditionnés deviennent-ils les **articles vendables** du hub caisse M7 (mapping produit→article) ? *[proposé : famille « produits finis » intégrée au stock M5, reliée aux articles vendables M7. Bloquant pour §3.A.5 / §3.I.]*
11. **Templates cartes/écrans** — combien, éditables ? *[proposé : 2-3 presets + injection marque/logo/couleur.]*
12. **Audit** — définir le/les KPI de valeur avant de décider de son maintien élargi (ticket d'étude).

---

## 6. Séquencement suggéré (input — à affiner par Fable)

Ordre de valeur, sous contrainte de dépendances :

1. **Chantier A — Boucle brassin** *(D1, priorité imposée)* : carte Brassins → corrections state machine + nouveaux steps → volumes → durées/agenda → **conditionnement → stock produits finis**. *(Débloque dashboard & cartes bar.)*
2. **Socle Apparence & Options** *(§3.B)* : transverse, peu risqué, débloque thème/rôles/services/switch-user/templates → **en partie parallélisable tôt**.
3. **Membres & Cotisations** *(§3.F/§3.G)* : logique statut + champs + emails (si D4 emails activé).
4. **Agenda + Tâches** *(§3.M/§3.L)* : briques du pilotage.
5. **Tableau de bord** *(§3.K)* : **en dernier**, car il agrège A + Membres + Tâches + Agenda.
6. **Compléments** : Équipement (§3.C), Recettes/BJCP/levure (§3.D), Calculateur soda keg (§3.E), Cartes/écrans templates (§3.I), Stock familles/recherche (§3.J), Audit admin-only + étude (§3.H) — à insérer selon dépendances et lots.

---

## 7. Livrable attendu de Fable

Un **plan détaillé** :
- Découpage en **milestones M9+** (epic + sous-tickets `M<n>-<xx>`), avec pour chaque ticket : périmètre, dépendances, ancrages code, impacts schéma/migration, entrées RBAC, formules à documenter, critères d'acceptation, tests attendus (100 % core).
- **Cadrage préalable** type M*-00 (comme les milestones précédents) rédigé dans `docs/SPEC-ORCHESTRATION.md`.
- **Résolution ou remontée** des questions §5 (surtout les bloquantes 2, 3, 9, 10).
- Respect intégral des règles §1 et de la cadence « checkpoint + feu vert par ticket ».

---

## 8. Déploiement appliance (mini-PC brasserie)

> Décidé avec Ludo le 2026-07-18. **Ce lot = LAN-only.** La connectivité externe et les couches de sécurité afférentes sont **repoussées à un step futur dédié** (voir 8.3).

### 8.1 — Décisions verrouillées

- **Conteneurisation maintenue (ADR-02)** : on **ne** repart **pas** en install « en dur ». La stack `docker-compose.yml` (api + postgres:16 + caddy TLS) et la procédure install/restore validée en M8 sont conservées telles quelles.
- **Cible matérielle** : mini-PC **économique et flexible** (Lenovo Tiny M-series, HP G-series type « G600 »… **modèle non figé**). Exigences : **≥ 16 Go RAM**, **SSD**. Le M70q évoqué n'était qu'un exemple.
- **Socle système = Proxmox VE (hôte) + 1 VM Debian** exécutant la stack `docker compose` **inchangée**.
  - Motif : objectifs *backups faciles* + *gestion par non-experts* + *flex*. Proxmox apporte UI web, **snapshots avant update (rollback 1 clic)**, sauvegarde planifiée de la VM entière.
  - **VM (pas LXC)** : évite les frictions Docker-dans-LXC (nesting/keyctl) — plus robuste pour un exploitant non-expert. Le dev ne change pas (la VM = l'install ADR-02 actuelle).
  - Alternative écartée : Debian nue + compose (moins de surface mais perte du rollback snapshot et de l'UI — contraire aux objectifs).
- **Périmètre réseau** : **LAN-only** pour ce lot (cf. §5 Q6/Q7 : météo/emails restent optionnels ; en LAN sans DNS public, trancher la stratégie TLS Caddy — domaine local + CA interne, ou HTTP-only LAN).

### 8.2 — Lot « durcissement appliance » à planifier (LAN-only)

Tickets d'infra à intégrer **avant l'install physique** :
1. **Socle Proxmox + VM Debian** : gabarit VM, install compose, doc reproductible (bash Git-Bash côté poste Windows de Ludo).
2. **Auto-démarrage / résilience coupure** : VM en démarrage auto, `restart: unless-stopped` (déjà là), + reco **onduleur (UPS)** avec arrêt propre (Postgres).
3. **Sauvegardes 2 niveaux** : (a) **Proxmox backup planifié de la VM** → USB/NAS externe (restore machine entière) ; (b) **`pg_dump` applicatif** cron (restore granulaire + portable, procédure M8). Externalisation obligatoire.
4. **TLS/domaine en LAN** : trancher domaine local + CA interne vs HTTP-only (cf. #226 routing Caddy). Point à décider **avant de flasher la machine**.
5. **Mises à jour** : stratégie image (pré-buildée/registry **ou** script `git pull && compose build && up -d`) + **snapshot Proxmox préalable**.

### 8.3 — Step FUTUR (hors ce lot) : connectivité externe + sécurité

À cadrer dans un **milestone dédié**, déclenché par le besoin d'accès externe. Conséquent :
- **Accès distant** : VPN (Tailscale/WireGuard) plutôt qu'ouverture de ports ; TLS public (domaine + DNS-challenge).
- **Chiffrement des PII membres** (au moins les données sensibles adhérents) — au repos, potentiellement au niveau champ.
- **Chiffrement disque (LUKS)** ⚠️ **tension d'archi à trancher** : un disque chiffré casse l'auto-start après coupure (passphrase au boot) → arbitrer déverrouillage TPM vs backups chiffrés uniquement.
- **Backups chiffrés** (Proxmox Backup Server = chiffrement côté client).
- **Durcissement** : pare-feu, fail2ban/rate-limit exposé, revue RBAC/rétention RGPD, journalisation.

### 8.4 — Questions ouvertes (appliance)

- **Proxmox vs Debian nue** : confirmer le choix Proxmox (reco) au regard du niveau réel de l'exploitant.
- **Modèle + RAM** du mini-PC retenu (≥ 16 Go visé).
- **Support de sauvegarde externe** disponible sur site (NAS ? USB dédié ?).
- **Domaine** : LAN-only confirmé pour ce lot ; domaine public réutilisable réservé au step futur.
