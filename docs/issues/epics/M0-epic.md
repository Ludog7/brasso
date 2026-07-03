---
labels: feature, P0
milestone: M0 — Socle
epic: true
---
# M0 — Socle (epic)

## Contexte
Issue chapeau du milestone M0 (SPEC-ORCHESTRATION §5.3). Regroupe les tickets d'infrastructure de base. Aucun code métier : uniquement l'ossature (monorepo, Docker, Prisma, API/RBAC, front, CI) qui rend exécutables les milestones suivants.

## Critère de démo
`docker compose up` → login, rôles fonctionnels, CI verte.

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloque le démarrage de M1 tant que la démo M0 n'est pas validée (§4, workflow de validation par milestone).
