---
labels: feature, P1
milestone: M13 — Pilotage
epic: true
---
# M13 — Pilotage : tâches, agenda & tableau de bord (epic)

## Contexte
Cinquième milestone du dev step 2 (SPEC-ORCHESTRATION §9 ; brief §3.K, §3.L, §3.M, décision D3). Il livre les briques de pilotage de l'association : un volet **Tâches**, un **agenda interne** offline-first agrégeant brassins, events et échéances, et le **tableau de bord permanent** de l'écran d'accueil.

Il est placé **en dernier des milestones fonctionnels**, délibérément : ses six tuiles agrègent M9 (brassins, volumes, produits finis), M12 (vie associative) et ses propres briques. Le planifier plus tôt aurait produit des tuiles vides.

## Objectif
Donner à l'association une vue de pilotage unique : ce qui arrive, ce qui est en cours, ce qui réclame une action.

## Critère de démo
L'écran d'accueil affiche en permanence, sous les boutons de fonctions, les **six tuiles** alimentées par de vraies données : prochain event, volume brassé sur l'année, brassins en cours avec la date du prochain step, stock de produits finis, météo du jour et tâches à échéance proche — la tuile météo se **masquant proprement** si le service est désactivé ou l'instance hors ligne.

## Sous-tickets
{{CHECKLIST}}

## Inventaire prévisionnel
> Corps détaillés rédigés à la fin de M12 (§5.5).

| Ticket | Domaine | Périmètre |
|---|---|---|
| **M13-01** | `db` | Migration « pilotage » : tables `Task` (type admin/brassage/orga/divers, responsable, échéance, description) et `AgendaEvent` (events et ouvertures). |
| **M13-02** | `api` | Module Tâches : CRUD sous la ressource RBAC **`taches`** créée par l'ADR-12 (M10-01), filtres par responsable, type et échéance. |
| **M13-03** | `api` | Agenda : agrégation des **jalons de brassin** (M9), des events et des **échéances de tâches** sous la ressource RBAC `agenda` ; source unique de la tuile « prochain event ». |
| **M13-04** | `api` | Export **`.ics`** et synchronisation externe **en opt-in non bloquant** (D3) : l'indisponibilité d'une synchro externe ne dégrade jamais l'agenda interne. |
| **M13-05** | `api` | Service **météo** (Open-Meteo, sans clé, §9.2 Q6) : latitude/longitude en `Settings`, appel serveur avec cache court, **dégradation gracieuse** — jamais d'attente bloquante. |
| **M13-06** | `web` | Volet Tâches : liste, création, affectation, échéances, mise en évidence de ce qui est en retard. |
| **M13-07** | `web` | Agenda interne **offline-first** : vues mois/semaine, brassins, events et tâches distingués, consultable **hors ligne** (ADR-08). |
| **M13-08** | `web` | Tableau de bord permanent : les **six tuiles** + boutons de fonctions en dessous ; chaque tuile gère ses états vide, chargement et erreur **indépendamment** — une tuile en échec n'emporte jamais la page. |

## Dépendances
Bloqué par : validation de la démo M12. Dépend de **M9** (brassins, volumes, produits finis), **M10** (ADR-12 pour les ressources RBAC `taches` et `agenda` ; activation du service météo), **M11** (stock produits finis navigable), **M12** (vie associative).
Bloque : rien — dernier milestone fonctionnel du lot.

## Points de vigilance
- **Offline-first** : agenda et tâches sont consultables sans réseau ; la météo est un **agrément**, jamais un prérequis d'affichage.
- Le tableau de bord est un **agrégateur** : il ne recalcule aucune règle métier côté front (le volume brassé agrégé vient de M9-09, le stock de M9-08, les statuts de M12-02).
- Une tuile lente ne doit pas retarder le rendu des autres.
- Cadence checkpoint + feu vert après chaque ticket.
