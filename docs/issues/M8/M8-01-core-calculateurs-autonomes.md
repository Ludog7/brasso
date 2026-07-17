---
labels: core, feature, P1
milestone: M8 — Durcissement & mise en prod
---
# M8-01 — core : calculateurs brassicoles autonomes (starter, eau, dilution, BIAB) + réf. FORMULES

## Contexte
Le milestone M8 « Durcissement & mise en prod » ajoute des **calculateurs d'atelier autonomes** (SPEC-ORCHESTRATION §4 — M8 : « calculateurs autonomes (starter, eau, dilution, BIAB) ») : des outils indépendants d'une recette ou d'un batch, pour un usage ponctuel au brassage. Comme tout calcul brassicole, ils sont **purs** (ADR-03) et vivent dans `packages/core`, consommés ensuite par le web ({{M8-02}}). **`docs/FORMULES-BRASSICOLES.md` fait foi** (CLAUDE.md) : la **dilution** (§9.3), l'**eau** (§6 empâtage/rinçage/strike + Annexe D sels) et le **blending** (§9.4) y sont déjà ; en revanche le **starter (taux d'inoculation levure)** et le **BIAB (brassage une seule cuve)** en sont **absents** → il faut les **documenter d'abord** (formule + valeurs de référence + source) avant de coder. SOURCE : `SPEC-ORCHESTRATION.md` §4 ; `docs/FORMULES-BRASSICOLES.md` §6, §9.3, §9.4, Annexe C/D.

## Objectif
`@brasso/core` expose quatre calculateurs **purs** (starter, eau, dilution, BIAB), chacun validé contre les valeurs de référence de `FORMULES-BRASSICOLES.md`, importables sans aucune dépendance recette/batch/DB/UI.

## Périmètre technique
- Fichiers/dossiers concernés : `docs/FORMULES-BRASSICOLES.md` (nouvelles sections **Starter** et **BIAB** avec valeurs de référence + sources en Annexe C) ; `packages/core/src/calculators/` (nouveau module : `starter.ts`, `dilution.ts`, `water.ts`, `biab.ts`, `index.ts`) + réexport dans `packages/core/src/index.ts` ; schémas Zod d'entrée dans `packages/core/src/schemas/` ; tests `packages/core/test/`.
- Hors périmètre explicite : l'UI ({{M8-02}}) ; toute persistance ; tout couplage à une recette/un batch/un profil d'équipement (les calculateurs sont **autonomes**, paramètres saisis à la main) ; la chimie de l'eau au-delà de l'existant (`packages/core/src/water/`, réutilisé tel quel).

## Spécification
**A. Documentation FORMULES d'abord (la doc fait foi)** — ajouter deux sections chiffrées + sources :
- **Starter / taux d'inoculation** : cellules requises `= tauxInoculation (Mcells/mL/°P) × volumeMoût(mL) × °Plato`, avec `°Plato ≈ (SG − 1) × 1000 / 4` (approx. usuelle, à borner) et taux de référence indicatifs (ex. ale ≈ 0,75 ; lager ≈ 1,5). Cellules disponibles `= nbUnités × cellulesParUnité × viabilité`. Déficit → besoin d'un pied de cuve ; taille de starter recommandée par un modèle de croissance simple (documenter le modèle retenu — ex. Braukaiser/White — et **borner** les extrapolations).
- **BIAB (une seule cuve, sans rinçage)** : `eauTotale = volumePréÉbullitionCible + absorptionGrain(L) + deadspace`, `absorptionGrain = grainAbsorptionLPerKg × masseGrainKg`, température d'empâtage via §6.3 (strike) existante. Aucun sparge.

**B. Calculateurs purs** (`packages/core/src/calculators/`, conversions **uniquement** via `units.ts`) :
- `computeStarter(input)` → `{ cellsRequired, cellsAvailable, deficit, recommendedStarterL }`. Zod `starterInputSchema` (volume, gravité/°Plato, type ale/lager ou taux explicite, nb sachets, viabilité).
- `computeDilution(input)` → §9.3 `SG2 = 1 + points(SG1) × V1 / V2 / 1000` ; deux modes : volume d'eau à ajouter pour atteindre une SG cible, **ou** SG résultante après ajout d'un volume. Réutilise `points()`/`gravity.ts`.
- `computeWater(input)` → volumes empâtage / rinçage / strike depuis ratio d'empâtage (L/kg), masse de grain, absorption, évaporation, deadspace (réutilise `equipment/waterPlan.ts` + `formulas/mash.ts`). Saisie **manuelle** (pas de profil d'équipement requis).
- `computeBiab(input)` → `{ totalWaterL, strikeTempC }`, une cuve, pas de rinçage.
- Tous **purs**, déterministes, sans horloge. Schémas Zod d'entrée exportés.

## Definition of Done
- [ ] `FORMULES-BRASSICOLES.md` étendu (**Starter** + **BIAB**) avec formules, valeurs de référence chiffrées et sources (Annexe C)
- [ ] Tests core (Vitest) ≥ **90 %** sur `calculators/` : chaque calculateur **validé contre les valeurs de référence** de FORMULES (starter : cellules requises/déficit ; dilution : SG2 des deux modes ; eau : volumes ; BIAB : eau totale) + cas limites (volume 0, SG < 1, grain 0)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés ; gate couverture `core` respecté
- [ ] Pas de régression sur les tests existants
- [ ] Critère observable : les 4 calculateurs sont importables depuis `@brasso/core`, purs, sans dépendance recette/batch/DB/UI

## Dépendances
Bloqué par : validation de la démo M7 (socle core M1 — `units.ts`, `formulas/`, `equipment/waterPlan.ts`, `water/` — déjà livré) — Bloque : {{M8-02}}
