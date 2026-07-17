# Brasso — runbooks d'exploitation

> Procédures d'**exploitation en production** : installer, restaurer, faire tourner
> les secrets, mettre à jour et dépanner Brasso, sans savoir implicite. Chaque
> runbook suit le format **préconditions → étapes → vérification → en cas d'échec**.
>
> - Développement (build, tests, carte du repo) : **`docs/DEV.md`** — on **référence**, on ne recopie pas.
> - Sauvegarde/restauration (scripts) : **`scripts/backup/README.md`** (M8-03).
> - Cadrage & sécurité : `docs/SPEC-ORCHESTRATION.md` §1 (stack), §4 (démo M8), §6 (sécurité/RGPD).
>
> ⚠️ **Aucun secret réel dans cette doc.** Tous les secrets vivent en variables
> d'environnement (`.env`, gitignoré). Exemples ci-dessous = placeholders.

## Architecture de production (rappel)

`docker-compose.yml` : trois services sur un réseau interne, **seul Caddy est exposé**.

```
Internet ─▶ caddy (80/443, TLS auto Let's Encrypt) ─▶ api (:3000, interne) ─▶ postgres (:5432, interne)
                    │                                        │
              volumes caddy_data/config              volume pgdata
```

- La base et l'API **ne publient aucun port** : accès uniquement via Caddy.
- L'API **valide sa configuration au démarrage** (`apps/api/src/config.ts`) et refuse
  de démarrer si un secret obligatoire manque (`SESSION_SECRET`, `DATABASE_URL`).
- L'image runtime lance `node apps/api/dist/index.js` : elle **n'applique pas** les
  migrations automatiquement — c'est une étape explicite (voir Runbook 1 et 4).

### Secrets & variables (`.env` à la racine)

| Variable                                                     | Rôle                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`        | Base PostgreSQL (compose en dérive `DATABASE_URL` de l'API). |
| `SESSION_SECRET`                                            | Signature des cookies de session (≥ 16 car.). `openssl rand -hex 32`. |
| `API_PORT`                                                  | Port interne de l'API (défaut 3000).                     |
| `DOMAIN` / `ACME_EMAIL`                                     | Domaine public servi + email ACME (TLS Caddy).           |
| `HELLOASSO_WEBHOOK_SECRET`                                  | Signature webhooks HelloAsso (adhésions/cotisations, M6).|
| `SUMUP_WEBHOOK_SECRET` / `ZETTLE_WEBHOOK_SECRET`           | Signature webhooks caisse SumUp / Zettle (M7).           |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Compte admin initial (seed, à usage de premier démarrage).|

Les providers de webhook référencent leur secret **par nom de variable**
(`ExternalProvider.webhookSecretRef`) ; le secret lui-même n'est **jamais** en base
(`apps/api/src/modules/webhooks/service.ts`). En prod (compose), `DATABASE_URL` de
l'API est **dérivée** des `POSTGRES_*` ; la ligne `DATABASE_URL` du `.env` sert aux
**outils lancés sur l'hôte** (migrations, seed, sauvegardes).

---

## Runbook 1 — Installation from scratch

**Préconditions**

- Docker + Docker Compose installés ; ports 80 et 443 libres et joignables depuis Internet.
- Un domaine (`DOMAIN`) dont l'enregistrement DNS A/AAAA pointe vers la machine (requis pour le TLS ACME).
- Le dépôt cloné sur la machine.

**Étapes**

1. Créer et renseigner les secrets :
   ```bash
   cp .env.example .env
   # Éditer .env : POSTGRES_PASSWORD, SESSION_SECRET (openssl rand -hex 32),
   # DOMAIN, ACME_EMAIL, *_WEBHOOK_SECRET utiles, SEED_ADMIN_*.
   ```
2. Construire et démarrer la stack :
   ```bash
   docker compose up -d --build
   ```
3. Appliquer les migrations sur la base (one-shot, ne modifie pas le service qui tourne) :
   ```bash
   docker compose run --rm api pnpm --filter @brasso/db db:deploy
   ```
4. Amorcer les données de référence + le compte admin (le `.env` de l'hôte est monté
   en lecture seule car le seed lit `SEED_ADMIN_*` via `--env-file`) :
   ```bash
   docker compose run --rm -v "$PWD/.env:/app/.env:ro" api pnpm --filter @brasso/db db:seed
   ```

**Vérification**

- Santé de l'API (réseau interne) :
  ```bash
  docker compose exec api node -e "fetch('http://localhost:'+(process.env.API_PORT||3000)+'/health').then(r=>r.json()).then(j=>console.log(j)).catch(e=>{console.error(e);process.exit(1)})"
  # → { status: 'ok' }
  ```
- TLS actif : `curl -fsS https://$DOMAIN/` renvoie l'application (certificat valide).
- Connexion : se connecter à `https://$DOMAIN/` avec `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`, puis ouvrir une route protégée (ex. Recettes) → contenu chargé.

**En cas d'échec**

- L'API redémarre en boucle → `docker compose logs api` : un secret manquant/invalide
  fait échouer la validation de config au démarrage (message explicite listant la variable).
- Pas de certificat TLS → `docker compose logs caddy` : vérifier que `DOMAIN` résout
  vers la machine et que les ports 80/443 sont ouverts (ACME HTTP-01).
- ⚠️ **Point de vigilance routage** : le `Caddyfile` proxifie `/api/*` vers l'API,
  mais les routes `/auth/*` et `/health` sont servies **à la racine** de l'API. Vérifier
  que le reverse proxy transmet bien l'authentification vers l'API pour l'installation
  cible (voir « Limitations connues »).

---

## Runbook 2 — Restauration depuis une sauvegarde

**Préconditions**

- Un dump produit par `scripts/backup/backup.sh` (format `pg_dump -Fc`).
- Accès à la base via `DATABASE_URL` ou les variables `PG*` (voir `scripts/backup/README.md`).

**Étapes**

1. (Optionnel mais recommandé) Prendre une sauvegarde de l'état courant avant toute manipulation :
   ```bash
   scripts/backup/backup.sh
   ```
2. Vérifier qu'un dump est restaurable (restauration dans une base jetable + comparaison des comptages) :
   ```bash
   scripts/backup/verify-restore.sh            # utilise le dernier dump
   ```
3. Restaurer dans une base cible **nommée** (garde-fou : refuse une cible non vide sans `--force`) :
   ```bash
   scripts/backup/restore.sh backups/brasso-AAAAMMJJ-HHMMSS.dump brasso_restore
   ```
4. Basculer l'application sur la base restaurée (pointer `POSTGRES_DB`/`DATABASE_URL`
   vers la base cible, ou restaurer dans la base de service à l'arrêt de l'API) puis
   `docker compose up -d`.

**Vérification**

- `verify-restore.sh` sort en code **0** et affiche `OK` pour toutes les tables clés
  (`User`, `Recipe`, `Batch`, `StockMovement`, `ExternalTransaction`, `Member`).
- Après remontée : santé API OK (Runbook 1) + connexion + une route protégée.

**En cas d'échec**

- `verify-restore.sh` sort **≠ 0** (divergence de comptages) → le dump est incomplet
  ou corrompu : ne pas mettre en service, reprendre un dump antérieur.
- `restore.sh` refuse la cible → la base cible n'est pas vide : choisir une base
  vierge, ou relancer avec `--force` en toute connaissance de cause.

---

## Runbook 3 — Rotation des secrets

**Préconditions** — Accès au `.env` de prod et, pour les webhooks, aux tableaux de bord
des providers (HelloAsso, SumUp, Zettle).

**`SESSION_SECRET`**

1. Générer un nouveau secret : `openssl rand -hex 32`.
2. Remplacer `SESSION_SECRET` dans `.env`.
3. Redémarrer l'API : `docker compose up -d api`.
4. **Effet** : toutes les sessions existantes sont invalidées → les utilisateurs se
   reconnectent. **Vérification** : une ancienne session est refusée, une nouvelle
   connexion fonctionne.

**Secrets de webhook (`*_WEBHOOK_SECRET`)**

1. Générer le nouveau secret et le renseigner **d'abord côté provider** (dashboard),
   puis dans `.env` (la variable référencée par `ExternalProvider.webhookSecretRef`).
2. Redémarrer l'API : `docker compose up -d api`.
3. **Vérification** : envoyer un webhook de test depuis le provider → il est accepté
   (signature valide) ; aucun nouvel item dans le dashboard des anomalies (M7).
4. **En cas d'échec** : signature invalide → `401`, aucune écriture (ADR-09) ; l'événement
   apparaît en anomalie. Vérifier la concordance exacte du secret des deux côtés.

---

## Runbook 4 — Migrations & mise à jour applicative

**Préconditions** — Nouvelle version récupérée (git), sauvegarde récente disponible.

> **Règle CLAUDE.md** : ne **jamais** éditer une migration déjà mergée — toute
> évolution de schéma passe par une **nouvelle** migration. Prisma ne fournit pas de
> « down migration » : le rollback de schéma se fait par **restauration de sauvegarde**.

**Étapes**

1. **Sauvegarder avant tout** : `scripts/backup/backup.sh`.
2. Récupérer la nouvelle version : `git pull` (ou déployer la nouvelle image).
3. Reconstruire : `docker compose build api` (et `web` si livré séparément).
4. Appliquer les migrations : `docker compose run --rm api pnpm --filter @brasso/db db:deploy`.
5. Redémarrer : `docker compose up -d`.

**Vérification** — Santé API OK, connexion OK, route protégée OK ; les nouvelles
migrations apparaissent comme appliquées (`db:deploy` affiche « All migrations
have been successfully applied »).

**Rollback**

1. Revenir à la version applicative précédente (image/tag/commit) et `docker compose up -d`.
2. Si la migration a modifié le schéma de façon incompatible : **restaurer** la
   sauvegarde prise à l'étape 1 (Runbook 2).

---

## Runbook 5 — Incidents courants

**Webhook en échec (vente/adhésion non prise en compte)**

- Consulter le **dashboard des anomalies** (M7) dans l'app (menu Anomalies) : cause
  normalisée (signature invalide, provider inactif, SKU non mappé…).
- Vérifier le secret (Runbook 3) et que le `ExternalProvider` est **actif**.
- Les transactions externes sont **append-only** (ADR-09) : on **retraite**, on ne
  modifie jamais le payload d'origine.

**Base injoignable**

- `docker compose ps` (état/healthcheck), `docker compose logs postgres`.
- L'API échoue au démarrage si `DATABASE_URL` est faux → `docker compose logs api`.
- Vérifier le volume `pgdata` (présent, non corrompu) et l'espace disque.

**Certificat / TLS**

- `docker compose logs caddy` : erreurs ACME (rate-limit Let's Encrypt, DNS, ports 80/443).
- S'assurer que `DOMAIN` résout vers la machine et que les ports sont ouverts.

**Consulter les logs**

```bash
docker compose logs -f api        # applicatif (config, requêtes, erreurs)
docker compose logs -f caddy      # reverse proxy / TLS
docker compose logs -f postgres   # base
```

---

## Runbook 6 — RGPD & exploitation

- **Où vivent les données personnelles** : PostgreSQL — `User`, `Member` (adhérents),
  `ExternalTransaction` (payloads de caisse/adhésion). Aucune donnée personnelle dans
  les logs applicatifs par conception.
- **Dumps de sauvegarde** : ils **contiennent** des données personnelles. Accès
  restreint, **jamais versionnés** (`backups/` et `*.dump` sont gitignorés), chiffrés
  s'ils quittent la machine. Voir `scripts/backup/README.md`.
- **Anonymisation** : le module Membres & RGPD (M6) fournit l'anonymisation et l'export
  des données d'un membre depuis l'application (rôle habilité). L'anonymisation est
  irréversible : prendre une sauvegarde avant traitement de masse.
- **Rétention** : appliquer la politique de rétention de l'association aux sauvegardes
  (rotation `BACKUP_KEEP`, purge des dumps anciens).

---

## Limitations connues (à confirmer avant mise en production réelle)

- **Routage Caddy** : `Caddyfile` proxifie uniquement `/api/*` vers l'API ; or `/auth/*`
  et `/health` sont exposés **à la racine** de l'API (`apps/api/src/app.ts`). La livraison
  web de production était marquée « finalisée en M0-08 » dans le `Caddyfile`. Avant un
  déploiement réel, confirmer que l'authentification est bien routée vers l'API (et non
  vers le fallback SPA). À traiter comme un ticket dédié si l'écart se confirme.
- Les procédures « données » (migrations sur base vierge, sauvegarde → restauration →
  vérification) ont été **rejouées** ; le déploiement TLS complet (Caddy + domaine réel)
  dépend de l'infrastructure d'hébergement de l'exploitant.
