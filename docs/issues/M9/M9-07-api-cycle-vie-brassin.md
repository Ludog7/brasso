---
labels: api, feature, P0
milestone: M9 — Boucle brassin complète
---
# M9-07 — api : cycle de vie du brassin post-Jour J (jalons, mesures de volume, transitions de statut)

## Contexte
`core` sait désormais calculer les jalons ({{M9-05}}) et la chaîne des volumes ({{M9-06}}), mais rien ne les persiste ni ne les expose. Le `BatchStatus` existe pourtant déjà au complet (`PLANIFIE → EN_BRASSAGE → EN_FERMENTATION → EN_CONDITIONNEMENT → TERMINE`, + `ANNULE`) : le cycle est décrit au schéma mais **jamais parcouru** au-delà du brassage, faute de route pour le faire avancer.

Ce ticket rend le cycle réel côté serveur, qui reste **autoritaire** (ADR-08). SOURCE : `docs/briefs/DEV-STEP-2.md` §3.A.3/§3.A.4 ; SPEC-ORCHESTRATION §3.2, §9.4 ; ADR-07, ADR-08.

## Objectif
L'API persiste et expose les jalons datés d'un brassin, ses mesures de volume et ses transitions de statut jusqu'à `TERMINE`, sous RBAC.

## Périmètre technique
- Fichiers concernés : `apps/api/src/modules/batches/` (`routes.ts`, `service.ts`, `repository.ts`, `schema.ts`) ; tests `apps/api/tests/`.
- Hors périmètre explicite : le conditionnement et les produits finis (M9-08) ; la liste/carte des brassins (M9-09) ; toute UI (M9-10 à M9-13) ; l'agenda (M13).

## Spécification

**A. Routes — jalons.**
- `POST /batches/:id/milestones` — crée la séquence de jalons **à la validation de l'ensemencement**, depuis les durées saisies. Le service appelle `buildBatchMilestones` de `core` : **aucun calcul de date dans l'API**, sous peine de dupliquer une règle métier hors de `core` (ADR-03). Les durées par défaut proviennent de `Settings` (M9-02) et sont surchargeables par la requête.
- `GET /batches/:id/milestones` — restitue les jalons, dates prévues et réelles.
- `PATCH /batches/:id/milestones/:kind` — ajuste une durée (recalcul en cascade des jalons suivants) ou renseigne un début/fin **réel**.

Règle : ajuster un jalon **recalcule les suivants** mais **ne réécrit jamais** un jalon déjà achevé (`actualEndAt` renseigné) — le passé constaté n'est pas révisable par un changement de prévision.

**B. Routes — mesures de volume.** Réutiliser `BatchMeasure` (type `VOLUME`, champ `phase`) — **aucune table nouvelle**. Exposer une route de synthèse `GET /batches/:id/volumes` qui restitue la chaîne calculée par `core` ({{M9-06}}) : volumes mesurés, volumes estimés, rendement de conditionnement, avertissements éventuels.

**C. Transitions de statut.** Étendre la route de statut existante (`POST /batches/:id/status`) pour couvrir tout le cycle :

| Transition | Déclencheur |
|---|---|
| `EN_BRASSAGE → EN_FERMENTATION` | validation de l'ensemencement (avec création des jalons) |
| `EN_FERMENTATION → EN_CONDITIONNEMENT` | fin du dernier jalon (garde) ou passage manuel |
| `EN_CONDITIONNEMENT → TERMINE` | conditionnement enregistré (M9-08) |

Transitions **validées côté serveur** : toute transition non prévue est refusée avec un message explicite. Renseigner au passage les dates clés déjà présentes au schéma (`fermentedAt`, `packagedAt`, `completedAt`) — elles existent et ne sont pas alimentées aujourd'hui. Un brassin `ANNULE` n'accepte plus aucune transition.

**D. RBAC.** **Aucune ressource nouvelle** : les routes `batches` déclarent déjà `recettes` (vérifié — `apps/api/src/modules/batches/routes.ts:40-86`). Couples à déclarer : lecture (jalons, volumes) ⇒ `("recettes", "read")` ; création de jalons, ajustements, transitions ⇒ `("recettes", "update")` ; création de la séquence ⇒ `("recettes", "create")`. Rappel `deny-by-default` : toute route ajoutée sans `config: app.rbac(...)` est refusée — le vérifier par un test, pas par relecture.

**E. Idempotence et concurrence.** Le Jour J tourne sur tablette avec une file d'actions offline rejouée à la reconnexion (ADR-08, M4-14) : la création de jalons doit être **idempotente** (rejouer la même validation d'ensemencement ne crée pas de doublon — la contrainte `@@unique([batchId, kind])` de M9-02 y aide, mais le service doit répondre proprement, pas par une erreur 500). Les transitions de statut doivent être sûres si rejouées.

## Definition of Done
- [ ] Tests d'intégration API (Vitest, repository en mémoire) : création, lecture et ajustement des jalons ; recalcul en cascade ; **refus de réécrire un jalon achevé** ; synthèse des volumes ; chaque transition valide **et** chaque transition invalide refusée ; brassin annulé figé
- [ ] Test RBAC par route : accès autorisé pour `admin`/`brasseur`, **refusé** pour `caisse` en écriture et `rgpd` en tout ; aucune route sans couple déclaré
- [ ] Test d'**idempotence** : double validation d'ensemencement ⇒ une seule séquence de jalons, réponse propre
- [ ] Aucun calcul de date ni de volume dans l'API — délégation à `@brasso/core` vérifiée en revue
- [ ] Lint + typecheck + CI verts ; Prettier passé sur **tous** les fichiers touchés (API comprise — piège CRLF connu, cf. `docs/DEV.md`)
- [ ] Critère observable : un brassin peut être mené de `EN_BRASSAGE` à `TERMINE` par l'API seule, jalons et volumes persistés

## Dépendances
Bloqué par : {{M9-02}}, {{M9-05}}, {{M9-06}} — Bloque : {{M9-10}}, {{M9-12}}, {{M9-13}}
