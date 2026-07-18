#!/usr/bin/env bash
#
# verify-restore.sh — **preuve** de la démo M8 : restaure le dernier dump dans une
# base jetable puis compare les comptages des tables clés entre la source et la
# copie. Sortie non nulle à la moindre divergence. Compatible Git Bash (Windows).
#
# Usage :
#   scripts/backup/verify-restore.sh [fichier.dump]   # défaut : dernier dump
# Variables : DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (= source).
#
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/backup/_common.sh
. "$DIR/_common.sh"

require_cmd pg_restore
require_cmd psql
require_cmd createdb
require_cmd dropdb
resolve_conn

DUMP="${1:-$(latest_dump)}"
[ -n "$DUMP" ] || die "aucun dump trouvé dans $BACKUP_DIR — lancez d'abord backup.sh."
[ -f "$DUMP" ] || die "dump introuvable : $DUMP"

SRC="$PGDATABASE"
TMPDB="brasso_verify_$(date +%Y%m%d%H%M%S)_$$"
cleanup() { dropdb --if-exists "$TMPDB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "Base source : $SRC — base jetable : $TMPDB"
log "Dump vérifié : $DUMP"

createdb "$TMPDB" || die "createdb a échoué pour la base jetable."
pg_restore --no-owner --no-privileges -d "$TMPDB" "$DUMP" ||
  die "pg_restore a échoué sur la base jetable."

FAIL=0
printf '%-22s %12s %12s   %s\n' "TABLE" "SOURCE" "COPIE" "ETAT"
printf '%-22s %12s %12s   %s\n' "----------------------" "------------" "------------" "----------"
for tbl in "${KEY_TABLES[@]}"; do
  s="$(table_count "$SRC" "$tbl")"
  c="$(table_count "$TMPDB" "$tbl")"
  if [ "$s" = "$c" ] && [ "$s" != "erreur" ]; then
    state="OK"
  else
    state="DIVERGENCE"
    FAIL=1
  fi
  printf '%-22s %12s %12s   %s\n' "$tbl" "$s" "$c" "$state"
done

if [ "$FAIL" -ne 0 ]; then
  die "vérification échouée : au moins une table diverge entre source et copie."
fi

log "Vérification réussie : la restauration reproduit fidèlement les comptages clés."
