#!/usr/bin/env bash
#
# _common.sh — helpers partagés des scripts de sauvegarde/restauration Brasso.
# Sourcé par backup.sh / restore.sh / verify-restore.sh. Compatible Git Bash (Windows).
#
# Résout la connexion PostgreSQL depuis DATABASE_URL **ou** les variables PG*
# (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). Aucun secret en dur : tout vient
# de l'environnement (SPEC-ORCHESTRATION §6).

log() { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31m[erreur]\033[0m %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 ||
    die "commande introuvable : $1 — installer les outils clients PostgreSQL (pg_dump/pg_restore/psql)."
}

# Emplacement des dumps et préfixe de nommage (surchargables par l'environnement).
_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$_COMMON_DIR/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
DUMP_PREFIX="${DUMP_PREFIX:-brasso}"

# Tables clés comparées par verify-restore.sh (identifiants Prisma, casse sensible).
KEY_TABLES=(User Recipe Batch StockMovement ExternalTransaction Member)

# Renseigne PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE depuis une URL postgres,
# sans écraser une variable PG* déjà exportée (l'explicite l'emporte sur l'URL).
_parse_database_url() {
  local url="$1" rest userinfo hostpart user pass hostportdb hostport db host port
  rest="${url#*://}"
  userinfo="${rest%%@*}"
  hostpart="${rest#*@}"
  user="${userinfo%%:*}"
  case "$userinfo" in
    *:*) pass="${userinfo#*:}" ;;
    *) pass="" ;;
  esac
  hostportdb="${hostpart%%\?*}" # retire la query string
  hostport="${hostportdb%%/*}"
  db="${hostportdb#*/}"
  host="${hostport%%:*}"
  case "$hostport" in
    *:*) port="${hostport#*:}" ;;
    *) port="" ;;
  esac
  [ -n "${PGUSER:-}" ] || export PGUSER="$user"
  [ -n "${PGHOST:-}" ] || export PGHOST="$host"
  [ -n "${PGDATABASE:-}" ] || export PGDATABASE="$db"
  [ -n "${PGPASSWORD:-}" ] || { [ -n "$pass" ] && export PGPASSWORD="$pass"; }
  [ -n "${PGPORT:-}" ] || { [ -n "$port" ] && export PGPORT="$port"; }
  return 0
}

# Exporte une connexion PostgreSQL exploitable par tous les outils clients.
resolve_conn() {
  [ -n "${DATABASE_URL:-}" ] && _parse_database_url "$DATABASE_URL"
  export PGHOST="${PGHOST:-localhost}"
  export PGPORT="${PGPORT:-5432}"
  export PGUSER="${PGUSER:-brasso}"
  export PGDATABASE="${PGDATABASE:-brasso}"
  [ -n "${PGPASSWORD:-}" ] ||
    warn "PGPASSWORD non défini : les outils pourraient demander le mot de passe (voir README, PGPASSWORD/.pgpass)."
  return 0
}

# Chemin du dump le plus récent dans BACKUP_DIR (vide si aucun).
latest_dump() {
  ls -1t "$BACKUP_DIR/$DUMP_PREFIX"-*.dump 2>/dev/null | head -n 1
}

# Comptage d'une table dans une base : entier, "absent" (table inexistante) ou
# "erreur" (connexion/requête impossible). Connexion héritée des variables PG*.
table_count() { # $1 base  $2 table
  local db="$1" tbl="$2" exists
  exists=$(psql -d "$db" -tAqc "SELECT to_regclass('\"$tbl\"') IS NOT NULL;" 2>/dev/null) || {
    echo "erreur"
    return 0
  }
  if [ "$exists" != "t" ]; then
    echo "absent"
    return 0
  fi
  psql -d "$db" -tAqc "SELECT count(*) FROM \"$tbl\";" 2>/dev/null || echo "erreur"
  return 0
}
