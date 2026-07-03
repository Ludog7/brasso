---
labels: core, feature, P0
milestone: M1 — Modèle & core
---
# M1-13 — core : state machine Jour J pure (états, transitions, timers)

## Contexte
ADR-08 (serveur = source de vérité, client = cache résilient) et spec métier « State Machine Jour J tolérante ». La logique d'états/transitions est **pure** dans `core` ; l'UI tablette et l'offline sync (M4) la consommeront.

## Objectif
`packages/core/src/stateMachine/` définit les phases, transitions, conditions et timers du Jour J sous forme pure et testable, avec le mode « Forcer l'étape ».

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/stateMachine/*`, tests.
- Hors périmètre explicite : UI (M4), persistance `BatchDayState`, offline queue (M4).

## Spécification (spec métier Niveau 1)
- Phases : Initialisation → Empâtage/Macération → Filtration/Pré-ébullition → Ébullition/Chauffe → Refroidissement → Ensemencement.
- Chaque étape : actions (Start/Stop/Valider), timers, saisies de mesures (densité/volume/température/pH), alertes (écarts vs modèle).
- **Timer de palier sanctuarisé** : ne démarre qu'après **stabilisation à la température cible confirmée** (saisie manuelle ou sonde). Modéliser explicitement cet état « en attente de stabilisation ».
- **Mode normal** : transitions conditionnées (timers/mesures vérifiés).
- **Mode manuel / Forcer l'étape** : transition possible malgré conditions incomplètes → produit une intention de `DeviationLog` (auteur, date, étape, motif) que la couche appelante persistera.
- Fonctions pures : `(state, event) → nextState` + calcul du temps estimé vs réel (via formules mash M1-08).
- Points d'extension pour capteurs IoT (spec §Extensibilité) sans coupler le cœur.

## Definition of Done
- [ ] Machine d'états pure : toutes les phases et transitions modélisées
- [ ] Timer de palier ne démarre qu'après stabilisation confirmée (testé)
- [ ] Forcer l'étape produit l'intention de DeviationLog (testé)
- [ ] Déterminisme : mêmes (state, event) → même résultat
- [ ] Couverture ≥ 90 %
- [ ] Lint + CI verte

## Dépendances
Bloqué par : {{M1-08}} — Bloque : {{M1-14}}
