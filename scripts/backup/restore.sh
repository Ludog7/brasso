#!/usr/bin/env bash
#
# restore.sh — restauration d'un dump Brasso dans une base cible **nommée**.
# Garde-fou anti-écrasement : refuse une base cible non vide sans --force.
# Compatible Git Bash (Windows). Aucun secret en dur.
#
# Usage :
#   scripts/backup/restore.sh <fichier.dump> <base-cible> [--force]
# Variables : DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGPASSWORD (base cible = argument).
#
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/backup/_common.sh
. "$DIR/_common.sh"

FORCE=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    *) ARGS+=("$a") ;;
  esac
done

DUMP="${ARGS[0]:-}"
TARGET="${ARGS[1]:-}"
[ -n "$DUMP" ] && [ -n "$TARGET" ] ||
  die "usage : restore.sh <fichier.dump> <base-cible> [--force]"
[ -f "$DUMP" ] || die "dump introuvable : $DUMP"

require_cmd pg_restore
require_cmd psql
require_cmd createdb
resolve_conn

# La base cible existe-t-elle déjà ? (interrogation de la base de maintenance)
EXISTS="$(psql -d postgres -tAqc "SELECT 1 FROM pg_database WHERE datname='$TARGET';" 2>/dev/null)"
if [ "$EXISTS" = "1" ]; then
  NTABLES="$(psql -d "$TARGET" -tAqc "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo 0)"
  if [ "${NTABLES:-0}" -gt 0 ] && [ "$FORCE" -ne 1 ]; then
    die "la base cible '$TARGET' contient déjà $NTABLES table(s). Relancez avec --force pour l'écraser."
  fi
else
  log "Création de la base cible '$TARGET'."
  createdb "$TARGET" || die "createdb a échoué pour '$TARGET'."
fi

log "Restauration de $DUMP → $TARGET"
if [ "$FORCE" -eq 1 ]; then
  pg_restore --no-owner --no-privileges --clean --if-exists -d "$TARGET" "$DUMP" ||
    die "pg_restore a échoué."
else
  pg_restore --no-owner --no-privileges -d "$TARGET" "$DUMP" ||
    die "pg_restore a échoué."
fi

log "Restauration terminée dans '$TARGET'."
