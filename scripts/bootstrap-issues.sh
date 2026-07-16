#!/usr/bin/env bash
#
# bootstrap-issues.sh — amorçage de l'orchestration GitHub de Brasso.
# Crée (idempotent) : labels, milestones M0→M8, issues depuis docs/issues/**,
# résout les dépendances {{Mx-yy}} en numéros réels, crée les epics chapeau.
#
# Prérequis : gh authentifié (gh auth status). Compatible Git Bash (Windows).
# Usage :
#   scripts/bootstrap-issues.sh            # exécute réellement
#   scripts/bootstrap-issues.sh --dry-run  # affiche sans rien créer
#
set -uo pipefail

REPO="${BRASSO_REPO:-Ludog7/brasso}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISSUES_DIR="$ROOT/docs/issues"
MAPFILE="$(mktemp)"
trap 'rm -f "$MAPFILE"' EXIT

log()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[erreur]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Parsing (frontmatter YAML minimal + corps markdown)
# ---------------------------------------------------------------------------
fm_field() { # $1 file, $2 field -> valeur
  awk -v f="$2" '
    /^---[ \t]*$/ { c++; next }
    c==1 && index($0, f":")==1 { sub("^"f":[ \t]*",""); print; exit }
  ' "$1"
}
get_title() { awk '/^# /{ sub(/^# /,""); print; exit }' "$1"; }
get_id()    { get_title "$1" | grep -oE '^M[0-9]+(-[0-9]+)?' | head -1; }
get_body()  { # après la 2e ligne ---, sans le H1 de titre
  awk 'BEGIN{c=0} /^---[ \t]*$/{c++; next} c>=2{print}' "$1" | sed '1{/^# /d;}'
}
set_labels() { # remplit le tableau global LABELS depuis le frontmatter
  LABELS=()
  local raw l oldIFS
  raw="$(fm_field "$1" labels)"
  oldIFS="$IFS"; IFS=','
  for l in $raw; do
    l="$(printf '%s' "$l" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    [ -n "$l" ] && LABELS+=(--label "$l")
  done
  IFS="$oldIFS"
}

command -v gh >/dev/null 2>&1 || die "gh introuvable dans le PATH."
[ "$DRY_RUN" = 1 ] || gh auth status >/dev/null 2>&1 || die "gh non authentifié (gh auth status)."

# ---------------------------------------------------------------------------
# 1) Labels (SPEC-ORCHESTRATION §5.1)
# ---------------------------------------------------------------------------
create_label() { # name color description
  if [ "$DRY_RUN" = 1 ]; then echo "DRY: label $1 ($2)"; return; fi
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null \
    && echo "  label: $1" || warn "label $1 : échec (ignoré)"
}
log "Labels…"
create_label core   "1d76db" "Domaine : coeur metier (packages/core)"
create_label api    "0e8a16" "Domaine : API Fastify (apps/api)"
create_label web    "5319e7" "Domaine : front React (apps/web)"
create_label db     "006b75" "Domaine : schema/migrations Prisma (packages/db)"
create_label infra  "555555" "Domaine : infra, Docker, CI"
create_label docs   "c5def5" "Domaine : documentation"
create_label feature    "a2eeef" "Type : fonctionnalite / tache"
create_label bug        "d73a4a" "Type : bug"
create_label adr        "fbca04" "Type : decision d'architecture"
create_label regulatory "b60205" "Type : reglementaire / conformite"
create_label chore      "ededed" "Type : maintenance / outillage"
create_label P0 "b60205" "Priorite : bloquant"
create_label P1 "d93f0b" "Priorite : normale"
create_label P2 "fef2c0" "Priorite : basse"
create_label blocked "e11d21" "Statut : bloque (voir issue liee en commentaire)"

# ---------------------------------------------------------------------------
# 2) Milestones M0→M8 (SPEC-ORCHESTRATION §4)
# ---------------------------------------------------------------------------
find_milestone() { # title -> number|empty
  gh api "repos/$REPO/milestones?state=all&per_page=100" \
    --jq "map(select(.title==\"$1\")) | .[0].number // empty" 2>/dev/null || true
}
create_milestone() { # title description
  local n; n="$(find_milestone "$1")"
  if [ -n "$n" ]; then echo "  milestone existe: $1 (#$n)"; return; fi
  if [ "$DRY_RUN" = 1 ]; then echo "DRY: milestone $1"; return; fi
  gh api "repos/$REPO/milestones" -f title="$1" -f state=open -f description="$2" >/dev/null \
    && echo "  milestone: $1" || warn "milestone $1 : échec"
}
log "Milestones…"
create_milestone "M0 — Socle" "Monorepo, Docker (app+pg+caddy), Prisma init, CI, auth+RBAC, CLAUDE.md, templates. Demo : docker compose up -> login, roles fonctionnels, CI verte."
create_milestone "M1 — Modèle & core" "Schema Prisma complet, seed, packages/core (3 moteurs + formules + state machine pure, >=90%). Demo : suite de tests core verte avec valeurs de reference."
create_milestone "M2 — Recettes" "CRUD 3 types de recettes, versioning/publication, editeur temps reel par moteur, import/export BeerXML (BEER) + JSON proprietaire (ALT/SOFT). Demo : creer/publier/versionner une recette de chaque type."
create_milestone "M3 — Équipements & batchs" "Profils d'equipement, strike temp, creation de batch (snapshot+n+reservation stock), plan de fermentation, journal, graphes. Demo : planifier un batch depuis une recette publiee, stock reserve."
create_milestone "M4 — Jour J" "State machine complete (UI tablette), timers post-stabilisation, mode normal / Forcer l'etape + DeviationLog, corrections densite pre-ebullition, file d'actions offline. Demo : brassage complet sur tablette, wifi coupe 10 min sans perte."
create_milestone "M5 — Stocks complets" "Logique RECETTE (reservation->deduction), BULK, inventaires, alertes de seuil, cout de revient par batch. Demo : batch ensemence decremente le stock ; cout de revient calcule."
create_milestone "M6 — Membres & RGPD" "CRUD membres, consentements historises, webhook HelloAsso, AuditLog, export/rectification/anonymisation. Demo : cycle adhesion -> cotisation HelloAsso -> statut a jour."
create_milestone "M7 — Hub caisse & affichage" "Webhooks SumUp/Zettle, mapping SKU, mode degrade + dashboard anomalies, exports CSV compta, module ecrans. Demo : vente SumUp -> stock decremente ; vente non mappee -> alerte ; ecran bar a jour."
create_milestone "M8 — Durcissement & mise en prod" "E2E Playwright (parcours critiques), backups pg_dump + restauration testee, runbooks, perf tablette, REG-01/REG-02, calculateurs autonomes. Demo : installation from scratch + restauration backup reussie."

# ---------------------------------------------------------------------------
# 3) Issues filles depuis docs/issues/M0 → M7
# ---------------------------------------------------------------------------
find_issue() { # $1 = id ("M0-01") ou titre exact -> number|empty
  gh issue list --repo "$REPO" --state all --limit 300 --json number,title \
    --jq "map(select(.title==\"$1\" or (.title | startswith(\"$1 \")))) | .[0].number // empty" 2>/dev/null || true
}
log "Issues filles…"
for ms in M0 M1 M2 M3 M4 M5 M6 M7; do
  for f in "$ISSUES_DIR/$ms"/*.md; do
    [ -e "$f" ] || continue
    id="$(get_id "$f")"; title="$(get_title "$f")"
    milestone="$(fm_field "$f" milestone)"; body="$(get_body "$f")"
    set_labels "$f"
    existing="$(find_issue "$id")"
    if [ -n "$existing" ]; then
      echo "  existe: $id -> #$existing"; echo "$id $existing" >> "$MAPFILE"; continue
    fi
    if [ "$DRY_RUN" = 1 ]; then
      echo "DRY: issue \"$title\" [ms:$milestone] ${LABELS[*]}"; echo "$id 0" >> "$MAPFILE"; continue
    fi
    url="$(gh issue create --repo "$REPO" --title "$title" --body "$body" \
             --milestone "$milestone" "${LABELS[@]}")" \
      || { warn "création $id échouée"; continue; }
    num="$(printf '%s' "$url" | grep -oE '[0-9]+$')"
    echo "  créé: $id -> #$num"; echo "$id $num" >> "$MAPFILE"
  done
done

# ---------------------------------------------------------------------------
# 4) Résolution des dépendances {{Mx-yy}} -> #num
# ---------------------------------------------------------------------------
build_sedscript() {
  while read -r id num; do
    [ "$num" = "0" ] && continue
    printf 's/{{%s}}/#%s/g\n' "$id" "$num"
  done < "$MAPFILE"
}
log "Résolution des dépendances…"
SEDSCRIPT="$(build_sedscript)"
for ms in M0 M1 M2 M3 M4 M5 M6 M7; do
  for f in "$ISSUES_DIR/$ms"/*.md; do
    [ -e "$f" ] || continue
    grep -q '{{M' "$f" || continue
    id="$(get_id "$f")"
    num="$(grep -E "^$id " "$MAPFILE" | awk '{print $2}' | head -1)"
    [ -z "$num" ] && continue
    [ "$num" = "0" ] && continue
    newbody="$(get_body "$f" | sed "$SEDSCRIPT")"
    if [ "$DRY_RUN" = 1 ]; then echo "DRY: edit #$num ($id) résout dépendances"; continue; fi
    printf '%s' "$newbody" | gh issue edit "$num" --repo "$REPO" --body-file - >/dev/null \
      && echo "  #$num ($id) dépendances résolues" || warn "edit #$num échoué"
  done
done

# ---------------------------------------------------------------------------
# 5) Epics chapeau
# ---------------------------------------------------------------------------
checklist_for() { # $1 = M0…M7
  for f in "$ISSUES_DIR/$1"/*.md; do
    [ -e "$f" ] || continue
    local id title num
    id="$(get_id "$f")"; title="$(get_title "$f")"
    num="$(grep -E "^$id " "$MAPFILE" | awk '{print $2}' | head -1)"
    if [ -n "$num" ] && [ "$num" != "0" ]; then
      printf -- "- [ ] #%s — %s\n" "$num" "$title"
    else
      printf -- "- [ ] %s\n" "$title"
    fi
  done
}
log "Epics…"
for ms in M0 M1 M2 M3 M4 M5 M6 M7; do
  ef="$ISSUES_DIR/epics/$ms-epic.md"
  [ -e "$ef" ] || continue
  etitle="$(get_title "$ef")"; emilestone="$(fm_field "$ef" milestone)"
  set_labels "$ef"
  CL="$(checklist_for "$ms")"; export CL
  ebody="$(get_body "$ef" | awk '{ if (index($0,"{{CHECKLIST}}")) print ENVIRON["CL"]; else print }')"
  existing="$(find_issue "$etitle")"
  if [ -n "$existing" ]; then
    echo "  epic existe: $etitle -> #$existing (maj corps)"
    [ "$DRY_RUN" = 1 ] || printf '%s' "$ebody" | gh issue edit "$existing" --repo "$REPO" --body-file - >/dev/null
    continue
  fi
  if [ "$DRY_RUN" = 1 ]; then echo "DRY: epic \"$etitle\" ${LABELS[*]}"; continue; fi
  url="$(gh issue create --repo "$REPO" --title "$etitle" --body "$ebody" \
           --milestone "$emilestone" "${LABELS[@]}")" \
    || { warn "epic $etitle échoué"; continue; }
  echo "  epic créé: $etitle -> $url"
done

log "Terminé. (dry-run=$DRY_RUN)"
