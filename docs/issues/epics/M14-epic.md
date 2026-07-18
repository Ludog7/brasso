---
labels: infra, feature, P1
milestone: M14 — Appliance LAN-only
epic: true
---
# M14 — Appliance LAN-only (Proxmox + VM Debian) (epic)

## Contexte
Dernier milestone du dev step 2 (SPEC-ORCHESTRATION §9 ; brief **§8**, décidé avec Ludo le 2026-07-18). Il prépare le déploiement sur le **mini-PC de la brasserie**. Périmètre strictement **LAN-only** : la connectivité externe et les couches de sécurité afférentes sont explicitement repoussées à un step futur dédié (brief §8.3).

**La conteneurisation est maintenue (ADR-02)** : on ne repart pas en installation « en dur ». La stack `docker-compose.yml` (api + postgres 16 + caddy) et la procédure d'installation/restauration validées en M8 sont conservées **telles quelles** — la VM Debian exécute l'installation ADR-02 existante, le développement ne change pas.

Il est placé **en dernier** parce qu'on ne fige pas une machine sur un périmètre fonctionnel encore mouvant.

## Objectif
Disposer d'une appliance reproductible, sauvegardée et récupérable en un geste, exploitable par des non-experts.

## Critère de démo
Installer l'appliance **from scratch** sur le mini-PC en suivant le runbook, prendre un **snapshot Proxmox**, appliquer une mise à jour, **revenir en arrière par rollback**, puis **restaurer une sauvegarde** depuis le support externe — le tout sans intervention d'un expert.

## Sous-tickets
{{CHECKLIST}}

## Inventaire prévisionnel
> Corps détaillés rédigés à la fin de M13 (§5.5). Scripts en **bash compatible Git Bash** (poste de pilotage Windows/PowerShell, `CLAUDE.md`).

| Ticket | Domaine | Périmètre |
|---|---|---|
| **M14-01** | `infra`+`docs` | Socle **Proxmox VE + une VM Debian** : gabarit de VM, installation de la stack compose **inchangée**, procédure reproductible et documentée. **VM et non LXC** — évite les frictions Docker-dans-LXC (nesting/keyctl), plus robuste pour un exploitant non-expert. |
| **M14-02** | `infra` | Auto-démarrage et résilience aux coupures : démarrage automatique de la VM, `restart: unless-stopped` (**déjà en place**), recommandation d'**onduleur** avec arrêt propre de Postgres. |
| **M14-03** | `infra` | Sauvegardes à **deux niveaux** : (a) sauvegarde Proxmox planifiée de la VM entière vers un support externe (restauration machine complète) ; (b) `pg_dump` applicatif par cron (restauration granulaire et portable, procédure M8). **Externalisation obligatoire** — une sauvegarde restée sur la machine ne protège de rien. |
| **M14-04** | `infra` | **TLS et domaine en LAN** : trancher entre domaine local + autorité de certification interne, ou HTTP-only sur le LAN. À décider **avant de flasher la machine**. Tenir compte du routage Caddy `/auth`, `/health`, `/webhooks` corrigé en #226. |
| **M14-05** | `infra`+`docs` | Stratégie de **mise à jour** : image pré-construite ou `git pull && compose build && up -d`, avec **snapshot Proxmox préalable systématique** et procédure de rollback documentée. |
| **M14-06** | `docs` | Runbook d'exploitation de l'appliance, en complément de `docs/RUNBOOKS.md` : installation, mise à jour, rollback, restauration, incidents courants — **rédigé pour un non-expert**. |

## Dépendances
Bloqué par : validation de la démo M13 (périmètre fonctionnel stabilisé). S'appuie sur **M8** (Docker Compose, backups `pg_dump`, runbooks, restauration testée) — ce milestone l'étend au matériel, ne le refait pas.
Bloque : rien dans ce lot. Ouvre le **step futur** « connectivité externe & sécurité » (brief §8.3).

## Points de vigilance
- **Périmètre LAN-only assumé.** VPN, TLS public, chiffrement des données personnelles, chiffrement disque (LUKS) et durcissement relèvent du step futur (§8.3) et **ne sont pas** à improviser ici.
- Tension d'architecture déjà identifiée pour plus tard : un disque chiffré casse l'auto-démarrage après coupure (passphrase au boot). À arbitrer dans le step dédié, pas dans celui-ci.
- **Questions ouvertes à confirmer avec Ludo avant M14-01** (brief §8.4) : confirmation du choix Proxmox au regard du niveau réel de l'exploitant ; modèle et RAM du mini-PC (**≥ 16 Go**, SSD) ; support de sauvegarde externe disponible sur site (NAS ou USB dédié).
- Cadence checkpoint + feu vert après chaque ticket.
