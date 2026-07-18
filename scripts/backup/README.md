# Sauvegardes & restauration PostgreSQL (M8-03)

Sauvegardes `pg_dump` horodatées, restauration dans une base nommée, et
**vérification** qui prouve qu'un dump est restaurable (comptages identiques
source ↔ copie). C'est le volet « restauration backup réussie » de la démo M8.

> ⚠️ **RGPD** : un dump contient des données personnelles (membres, transactions).
> Ne **jamais** versionner un dump (le dossier `backups/` est gitignoré), en
> restreindre l'accès, et le stocker chiffré s'il quitte la machine.

## Prérequis

- Outils clients PostgreSQL dans le `PATH` : `pg_dump`, `pg_restore`, `psql`,
  `createdb`, `dropdb` (fournis avec PostgreSQL 16).
- Une connexion, via l'**environnement** (aucun secret en dur dans les scripts) :
  - soit `DATABASE_URL` (ex. `postgresql://brasso:…@localhost:5433/brasso?schema=public`),
  - soit les variables libpq `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`.
  - `PGPASSWORD` (ou un fichier `~/.pgpass`) évite l'invite de mot de passe.
- L'utilisateur de connexion doit pouvoir créer/supprimer des bases
  (`createdb`/`dropdb`) pour `verify-restore.sh` (le superuser du cluster convient).

## Scripts

| Script              | Rôle                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `backup.sh`         | `pg_dump -Fc` horodaté (`brasso-YYYYMMDD-HHMMSS.dump`) + rotation.           |
| `restore.sh`        | Restaure un dump dans une base **cible nommée** (garde-fou `--force`).       |
| `verify-restore.sh` | Restaure le dernier dump dans une base **jetable** et compare les comptages. |

### Variables

| Variable      | Défaut           | Effet                                 |
| ------------- | ---------------- | ------------------------------------- |
| `BACKUP_DIR`  | `<repo>/backups` | Dossier des dumps.                    |
| `BACKUP_KEEP` | `7`              | Nombre de dumps conservés (rotation). |
| `DUMP_PREFIX` | `brasso`         | Préfixe des fichiers de dump.         |

## Cycle complet (démo)

```bash
# 1. Sauvegarde de la base courante
scripts/backup/backup.sh

# 2. Preuve : restauration dans une base jetable + comparaison des comptages
scripts/backup/verify-restore.sh
#   → tableau SOURCE / COPIE par table, sortie != 0 à la moindre divergence

# 3. Restauration réelle dans une base vierge nommée
scripts/backup/restore.sh backups/brasso-20260717-120000.dump brasso_restore
```

### Base locale (port 5433)

Le poste de dev expose PostgreSQL sur le port **5433** :

```bash
export DATABASE_URL='postgresql://brasso:brasso@localhost:5433/brasso?schema=public'
scripts/backup/backup.sh && scripts/backup/verify-restore.sh
```

## Docker Compose

Base en conteneur (réseau interne, port non publié) — exécuter les outils dans le
conteneur `postgres`, ou depuis un conteneur client sur le réseau `internal` :

```bash
# Dump depuis le conteneur postgres vers un fichier de l'hôte
docker compose exec -T postgres \
  pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/brasso-$(date +%Y%m%d-%H%M%S).dump"
```

### Planification (cron)

Sauvegarde quotidienne à 3 h, journalisée :

```cron
0 3 * * *  cd /opt/brasso && DATABASE_URL='postgresql://…' scripts/backup/backup.sh >> /var/log/brasso-backup.log 2>&1
```

Sur Windows, utiliser le **Planificateur de tâches** en appelant `bash scripts/backup/backup.sh`.
