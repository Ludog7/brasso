---
labels: core, feature, P1
milestone: M4 — Jour J
---
# M4-02 — core : corrections densité pré-ébullition (impact estimé DI/ABV)

## Contexte
`SPEC-FONCTIONNELLE.md` « Corrections en cours de route » : sur la mesure densité/volume **pré-ébullition**, comparer au modèle et proposer des corrections (allonger l'ébullition, ajouter sucre/extrait) avec **impact estimé sur DI/ABV**. `docs/FORMULES-BRASSICOLES.md` fait foi : §1/§2 (densités, points), §3 (ABV 131,25), §9.3 (dilution / concentration par évaporation). Aide à la décision, jamais prescriptif (ADR-11).

## Objectif
`@brasso/core` expose `suggestPreBoilCorrections(input)` (pur) : écart au modèle + propositions chiffrées (durée d'ébullition additionnelle, masse de sucre/extrait) avec OG et ABV projetés pour chaque option.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/formulas/corrections.ts` (nouveau), export `src/index.ts`, tests `packages/core/tests/formulas/`.
- Hors périmètre explicite : journalisation (M4-07 api), UI (M4-13), recalcul du houblonnage/IBU.

## Spécification
- Entrée : `{ measuredGravity, measuredVolumeL, targetPreBoilGravity, targetPreBoilVolumeL, targetOg, evaporationRateLPerHour, plannedBoilTimeMin, expectedAttenuationPct }` (unités internes : SG brute, L, L/h, min, %).
- Calculs (FORMULES uniquement, aucune constante hors `units.ts`/document) :
  - Écart en **points** de densité mesuré vs cible pré-ébullition (`deltaGravity`) et projection sur l'OG (`deltaOg`).
  - **Allonger l'ébullition** : évaporation supplémentaire → réduction de volume → concentration de la densité (relation §9.3, inverse de la dilution). Calculer `extraBoilMin` pour atteindre `targetOg`, puis `projectedOg`/`projectedAbv` (§3).
  - **Ajouter sucre/extrait** : points apportés par kg (§1) pour combler le déficit → `sugarKg`, `projectedOg`/`projectedAbv`.
  - Densité mesurée **≥** cible → proposition informative de **dilution** (ajout d'eau, §9.3) plutôt que concentration.
- Sortie : `{ deltaGravity, deltaOg, proposals: [{ kind: "extend_boil" | "add_sugar" | "dilute", ...valeurs, projectedOg, projectedAbv }] }`. Wording indicatif (« estimation », « aide à la décision »).

## Definition of Done
- [ ] Tests : cas de référence calculé à la main (densité pré-ébullition **basse** → `extraBoilMin` **ou** `sugarKg` amenant `projectedOg ≈ targetOg` à tolérance ; densité haute → proposition `dilute`), valeurs cohérentes FORMULES §9.3/§3
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : une mesure pré-ébullition sous le modèle produit des propositions chiffrées et reproductibles

## Dépendances
Bloqué par : {{M1-04}}, {{M1-11}} — Bloque : {{M4-07}}, {{M4-13}}
