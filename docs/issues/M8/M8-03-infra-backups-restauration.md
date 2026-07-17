---
labels: infra, feature, P0
milestone: M8 — Durcissement & mise en prod
---
# M8-03 — infra : sauvegardes pg_dump automatisées + restauration testée

## Contexte
La démo de M8 est **« installation from scratch + restauration backup réussie »** (SPEC-ORCHESTRATION §4). Ce ticket porte le **volet sauvegarde/restauration** : des sauvegardes régulières et vérifiables de PostgreSQL, et surtout une **procédure de restauration réellement testée** (une sauvegarde qu'on ne sait pas restaurer ne vaut rien). Scripts fournis en **bash compatible Git Bash** (poste Ludo = Windows/PowerShell). SOURCE : `SPEC-ORCHESTRATION.md` §4 (démo M8), §1 (stack Docker Compose app+postgres+caddy).

## Objectif
Une sauvegarde `pg_dump` peut être produite et **restaurée** dans une base vierge de façon vérifiée (données identiques), le tout scripté et documenté.

## Périmètre technique
- Fichiers/dossiers concernés : `scripts/backup/` (`backup.sh` = `pg_dump` compressé horodaté + rotation ; `restore.sh` = restauration dans une base cible ; `verify-restore.sh` = restauration dans une base jetable + contrôle de cohérence) ; intégration Docker Compose (service/one-shot ou cron documenté) ; variables d'env de connexion (jamais de secret en dur) ; un court `README` dans `scripts/backup/`.
- Hors périmètre explicite : la doc d'exploitation d'ensemble (runbooks {{M8-04}}) ; la sauvegarde applicative hors PostgreSQL ; l'hébergement/stockage distant des dumps (mentionné mais non implémenté).

## Spécification
- **backup** : `pg_dump` (format `custom`/`-Fc` compressé) horodaté (`brasso-YYYYMMDD-HHMMSS.dump`), **rotation** (conserver N dernières), connexion via variables d'env (`DATABASE_URL` ou `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`) — **aucun secret en clair** dans le script. Compatible base locale (port dédié **5433**) et base en conteneur.
- **restore** : `pg_restore` dans une base cible **explicitement nommée** (garde-fou anti-écrasement : refuser une cible non vide sans `--force`).
- **verify-restore** : restaure le dernier dump dans une base **jetable** puis compare un jeu de contrôles (comptages de tables clés : `User`, `Recipe`, `Batch`, `StockMovement`, `ExternalTransaction`, `Member`) entre source et copie → sortie non nulle si divergence. C'est ce script qui **prouve** la démo.
- **Sécurité** : secrets uniquement en variables d'environnement (rappel §6) ; les dumps peuvent contenir des données personnelles → note RGPD (accès restreint, ne pas versionner de dump).
- **Idempotence/robustesse** : scripts ré-exécutables, messages clairs, codes de sortie explicites.

## Definition of Done
- [ ] `backup.sh` produit un dump horodaté + applique la rotation ; `restore.sh` restaure dans une base cible ; `verify-restore.sh` restaure dans une base jetable et **compare les comptages** (échoue à la moindre divergence)
- [ ] Procédure exécutable sur base locale (5433) documentée dans `scripts/backup/README`
- [ ] Aucun secret en dur ; note RGPD sur les dumps
- [ ] Lint/CI verte (les `.sh` ne cassent pas `format:check`) ; pas de régression
- [ ] Critère observable : un cycle **dump → restauration en base vierge → vérification de cohérence** réussit

## Dépendances
Bloqué par : validation de la démo M7 (schéma Prisma complet, Docker Compose M0) — Bloque : {{M8-04}}
