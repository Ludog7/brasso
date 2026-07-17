---
labels: feature, P0
milestone: M8 — Durcissement & mise en prod
epic: true
---
# M8 — Durcissement & mise en prod (epic)

## Contexte
Issue chapeau du **dernier** milestone (SPEC-ORCHESTRATION §4). Après M0–M7 (socle, core, recettes, batchs, Jour J, stocks, membres/RGPD, hub caisse & affichage), M8 **durcit** la plateforme et prépare le **go-live** : verrouiller les parcours critiques par des E2E, garantir la reprise après incident (sauvegardes + restauration **testée**), documenter l'exploitation (runbooks), alléger l'app tablette, franchir les **gates réglementaires** (REG-01 frontière NF525, REG-02 relecture pH/HACCP) et livrer les **calculateurs d'atelier autonomes** (starter, eau, dilution, BIAB). Aucune nouvelle brique métier lourde : on consolide l'existant et on rend l'installation/l'exploitation reproductibles.

## Critère de démo
**Installation from scratch documentée + restauration de sauvegarde réussie** (§4) : un opérateur installe Brasso à partir de zéro en suivant les runbooks, puis restaure une sauvegarde `pg_dump` dans une base vierge avec vérification de cohérence. En complément : les **4 parcours critiques** (brassage complet, vente mappée, vente non mappée, cycle adhésion) sont couverts par des E2E Playwright bloquants en CI, et les **gates réglementaires** REG-01/REG-02 sont instruits.

## Sous-tickets
{{CHECKLIST}}

## Dépendances
Bloqué par la validation de la démo M7. S'appuie sur l'ensemble M0–M7 : socle Docker Compose + CI (M0), core (M1, base des calculateurs), parcours brassage (M2–M5), hub caisse & webhooks signés (M6–M7, ADR-09), module pH/stabilisation (ADR-11). REG-01 et REG-02 sont des **prérequis à la mise en production** (pas au développement) : ils conditionnent le go-live, pas les autres tickets. **Dernier milestone du projet** : sa validation ouvre la mise en production.
