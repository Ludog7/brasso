---
labels: feature, P0
milestone: M4 — Jour J
epic: true
---
# M4 — Jour J (epic)

## Contexte
Issue chapeau du milestone M4 (SPEC-ORCHESTRATION §4 ; ADR-05 tablette/PWA, ADR-08 state machine). Déroulé **interactif** d'un brassage sur tablette d'atelier : state machine où le **serveur est source de vérité** (réducteur pur déjà livré en M1-13), timers **sanctuarisés** (n'arment qu'après stabilisation confirmée), mode normal / « **Forcer l'étape** » + journal d'écart, **corrections densité** pré-ébullition avec impact estimé DI/ABV, et **file d'actions offline** rejouée à la reconnexion. S'appuie sur les batchs planifiés (M3) et la machine pure (M1-13).

## Critère de démo
Dérouler un brassage complet sur tablette depuis un batch planifié (`EN_BRASSAGE` → `EN_FERMENTATION`) : démarrer les étapes, **confirmer la stabilisation** (le timer ne court qu'ensuite), saisir des mesures, **forcer une étape** (trace au journal), obtenir une **correction densité chiffrée** — **wifi coupé 10 min sans perte** (file offline rejouée, idempotente).

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M3 (batch planifié, stock réservé) et par la state machine pure M1-13. Bloque M5 (la déduction de stock à l'ensemencement s'enchaîne sur la clôture du Jour J).
