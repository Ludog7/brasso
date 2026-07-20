---
labels: db, feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
---
# M10-04 — db : migration « options & identité » (Settings d'apparence et de services, PIN utilisateur)

## Contexte
M10 introduit un volet « Options générales » et une bascule d'utilisateur par PIN. Les deux exigent des champs qui n'existent pas : l'identité visuelle de la brasserie (nom déjà présent, mais ni logo ni couleur de marque), les réglages de services, et le PIN haché avec ses métadonnées de verrouillage.

`Settings` existe déjà (`packages/db/prisma/schema.prisma`) et porte `assoName`, `tvaRatePpm`, `defaultWaterProfile`, `timezone`, `membershipPeriodDays` et les durées du cycle post-ensemencement (M9). Ce ticket **étend** cette table — il n'en crée pas une seconde. ADR-01 : aucune constante métier hors de cette table.

SOURCE : SPEC-ORCHESTRATION §9.4 (impacts transverses) ; ADR-13 ({{M10-02}}) pour le PIN ; ADR-12 ({{M10-01}}) pour la séparation `parametres` / `options`.

## Objectif
Une migration additive fournit les champs d'apparence, de services et de PIN dont {{M10-05}}, {{M10-06}} et le front ont besoin — sans toucher à aucune migration déjà mergée.

## Périmètre technique
- `packages/db/prisma/schema.prisma` + **nouvelle** migration dans `prisma/migrations/`.
- `packages/db/seed/` : valeurs par défaut cohérentes avec le thème clair (ADR-14).
- Miroir `packages/core/src/schemas/enums.ts` si un enum est introduit (ADR-03/04 : on **recopie les valeurs**, on n'importe pas Prisma).
- Hors périmètre : toute route ({{M10-05}}, {{M10-06}}), toute UI, et **tout secret** — SMTP et consorts vivent en variables d'environnement, **jamais** en base.

## Spécification

**A. Apparence.** Logo (voir C), nom déjà présent, **couleur de marque** (chaîne hexadécimale validée), et le thème par défaut de l'instance. ⚠️ La **règle de persistance du choix de thème** (par utilisateur ou par poste) est tranchée par **ADR-14 §C** ({{M10-03}}) : si elle retient « par poste », ce champ n'a pas à exister ici. **Lire l'ADR avant de créer la colonne** plutôt que de la créer « au cas où ».

**B. Services.** Activation de la météo + **latitude/longitude** (Open-Meteo, §9.2 Q6). Bornes de validité à poser au schéma (latitude −90/90, longitude −180/180). Le service désactivé ou injoignable **masque la tuile** — jamais d'attente bloquante (offline-first).

**C. Logo — stocker un fichier, pas une image en base.** Cohérent avec la décision « photo membre » (§9.2 Q8) : blob **local** sur le volume de la VM, la table ne porte qu'un **chemin ou identifiant**. Un logo en base gonfle chaque sauvegarde logique et complique la restauration. Poser aussi les bornes : format(s) acceptés, taille maximale.

**D. PIN.** `User.pinHash` (**Argon2id**, jamais en clair — même traitement que le mot de passe) plus les métadonnées de verrouillage exigées par ADR-13 : compteur d'échecs, horodatage du dernier échec, fin de blocage. ⚠️ Les **valeurs** (seuil, fenêtre, durées) ne sont **pas** des colonnes : ce sont des paramètres. Ce ticket pose les colonnes d'**état**, pas la politique.

Le PIN est **facultatif** : `pinHash` nullable, et l'absence de PIN doit être un état de premier ordre — pas une chaîne vide. Rappel ADR-13 : longueur **4 chiffres, 6 pour `admin`** ; la longueur n'est pas stockée, elle se déduit à la pose et se vérifie côté service.

**E. Templates.** Réutiliser l'enum **`DisplayTemplate` existant** (`LIST`/`TABLE`/`CARDS`, §9.2 Q11). **Aucun nouvel enum** — la demande est de l'injection de marque, pas une nouvelle famille de gabarits.

## Definition of Done
- [ ] Migration **additive** créée ; **aucune migration mergée modifiée**
- [ ] `Settings` étendue (apparence, services + géolocalisation bornée, templates) — **pas** de seconde table de réglages
- [ ] Le champ de thème par défaut n'est créé **que si ADR-14 §C le justifie** ; sinon, l'absence est justifiée dans la PR
- [ ] `User.pinHash` nullable + métadonnées de verrouillage ; **aucune** valeur de politique en colonne
- [ ] Le logo est référencé par chemin, **pas stocké en base** ; format et taille bornés
- [ ] **Aucun secret en base** (SMTP et assimilés restent en variables d'environnement)
- [ ] Enums recopiés dans `core/schemas/enums.ts` le cas échéant ; aucune divergence
- [ ] Seed cohérent avec le thème clair par défaut
- [ ] `pnpm --filter @brasso/db db:migrate` puis `db:seed` rejouables sur une base vierge
- [ ] Prettier passé ; CI verte

## Dépendances
Bloqué par : {{M10-01}} (ADR-12), {{M10-02}} (ADR-13), {{M10-03}} (ADR-14 §C) — Bloque : {{M10-05}}, {{M10-06}}
