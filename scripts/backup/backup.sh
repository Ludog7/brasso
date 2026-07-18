#!/usr/bin/env bash
#
# backup.sh — sauvegarde PostgreSQL Brasso : pg_dump format custom (compressé),
# horodaté, avec rotation. Compatible Git Bash (Windows). Aucun secret en dur.
#
# Usage :
#   scripts/backup/backup.sh
# Variables :
#   DATABASE_URL ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE — connexion
#   BACKUP_DIR   — dossier des dumps (défaut : <repo>/backups)
#   BACKUP_KEEP  — nombre de dumps conservés (défaut : 7)
#
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/backup/_common.sh
. "$DIR/_common.sh"

require_cmd pg_dump
resolve_conn

mkdir -p "$BACKUP_DIR" || die "impossible de créer le dossier de sauvegarde : $BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/$DUMP_PREFIX-$TS.dump"

log "Sauvegarde de $PGDATABASE@$PGHOST:$PGPORT → $OUT"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$PGDATABASE" ||
  die "pg_dump a échoué (connexion ? droits ? voir README)."

log "Dump créé : $OUT ($(du -h "$OUT" 2>/dev/null | cut -f1))"

# Rotation : conserver les BACKUP_KEEP derniers dumps.
KEEP="${BACKUP_KEEP:-7}"
mapfile -t OLD < <(ls -1t "$BACKUP_DIR/$DUMP_PREFIX"-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  log "Rotation : suppression de ${#OLD[@]} dump(s) au-delà des $KEEP derniers."
  rm -f "${OLD[@]}"
fi

log "Terminé."
