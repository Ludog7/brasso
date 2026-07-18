---
labels: feature, P1
milestone: M11 — Atelier & catalogue
epic: true
---
# M11 — Atelier & catalogue : équipement, recettes, stock, cartes du bar (epic)

## Contexte
Troisième milestone du dev step 2 (SPEC-ORCHESTRATION §9 ; brief §3.C, §3.D, §3.E, §3.H, §3.I, §3.J). Il regroupe les compléments métier qui partagent une même nature — enrichir le **catalogue** et les **outils de conception** — et qui dépendent des deux milestones précédents : les cartes du bar attendent les produits finis de M9, leurs templates attendent le volet Options de M10.

On y traite aussi deux bugs de réactivité signalés au test réel sur l'éditeur de recettes, et deux formules à documenter **avant** tout code (levure sèche, carbonatation soda keg).

## Objectif
Compléter l'outillage d'atelier — équipement, recettes, calculateurs, stock — et faire des boissons finies les articles réellement proposés sur les cartes du bar.

## Critère de démo
L'onglet **Prévision** d'une recette s'affiche dès l'ouverture et se met à jour **en direct** pendant la saisie ; une recette à levure sèche affiche la **quantité calculée** ; le calculateur donne la pression de carbonatation d'un **soda en keg** ; le stock se parcourt **par famille avec recherche**, sans les articles à quantité nulle ; et la **carte du bar** se compose des seules boissons finies en stock, aux couleurs de la brasserie.

## Sous-tickets
{{CHECKLIST}}

## Inventaire prévisionnel
> Corps détaillés rédigés à la fin de M10 (§5.5).

| Ticket | Domaine | Périmètre |
|---|---|---|
| **M11-01** | `db` | Migration « catalogue & équipement » : catégories/types d'équipement, type de chauffe (gaz/électrique), type et quantité de levure, familles de stock extensibles. |
| **M11-02** | `core`+`api` | Schéma d'équipement étendu : **catégories** (cuve, **fermenteur**, **embouteillage**), sélecteur **gaz/électrique**. Ancrages : `packages/core/src/schemas/equipment.ts`, `apps/api/src/modules/equipment/`. |
| **M11-03** | `web` | Formulaire d'équipement : mode **avancé/expert** pour la masse thermique (conservée — consommée par `estimateRampMin`, `buildPlan.ts:92-111`), libellé « volume **perdu** » (**UI seule**, clé `deadspaceL` inchangée, aucune migration). |
| **M11-04** | `docs`+`core` | **Levure sèche** — FORMULES **§12.3 d'abord** : `gSèche = cellulesReq / DRY_YEAST_CELLS_PER_GRAM`, dérivée du modèle d'inoculation §12.1 existant (§9.2 Q2). **Sourcer la constante sur ≥ 2 fiches techniques fabricant**, valeurs de référence, Annexe C — **puis** coder. ADR-11 : indicateur, pas garantie. |
| **M11-05** | `core` | **BJCP** familles → sous-familles : compléter `packages/core/src/reference/bjcpStyles.ts` (**14 styles** aujourd'hui, `category` à plat). Reste en données `core`, pas en table (précédent M1-02, ADR-01). Licence : codes, noms et statistiques vitales uniquement, **aucune prose descriptive**, avec attribution. |
| **M11-06** | `docs`+`core` | **Carbonatation soda keg** — aucune physique nouvelle : `kegPressurePsi` (§8.2) est déjà là et indépendante du liquide. Compléter **§8.3** (volumes CO₂ sodas/boissons alt) + **bornes de validité**, puis calculateur mince. ADR-11 + **alerte de surpression**. |
| **M11-07** | `web` | Éditeur de recettes — **BUG de réactivité** : onglet « Prévision » visible **dès l'ouverture** et recalculé en direct (OG/FG/ABV + pastille de couleur). Code hexa **masqué** dans l'éditeur mais **exposé** pour l'affichage de vente. Cf. `docs/patterns/editeur-moteur-recette.md` §3 (`useDeferredValue`). |
| **M11-08** | `web` | Éditeur : type de levure **liquide/sèche**, quantité prévue et quantité calculée (M11-04) ; sélecteur de style **familles → sous-familles** (M11-05). |
| **M11-09** | `web` | Calculateurs : carbonatation soda keg (M11-06) branchée dans la page calculateurs (M8-02). |
| **M11-10** | `api`+`web` | Stock : **familles extensibles**, **champ de recherche**, **masquage des articles à quantité nulle**, famille **produits finis** (M9) intégrée à la navigation. |
| **M11-11** | `chore` | **Étude Audit** : définir les KPI et cas d'usage réels avant tout élargissement. Constat de départ — la matrice restreint **déjà** `auditLog` à `admin` et `rgpd` ; le reste est de la visibilité UI. |
| **M11-12** | `web` | Cartes du bar & écrans : n'y proposer que les **boissons finies** (jamais les fournitures), templates depuis les Options (enum `DisplayTemplate` **existant** : `LIST`/`TABLE`/`CARDS`), injection logo/nom/couleur de marque + **code hexa de la recette**. |

## Dépendances
Bloqué par : validation de la démo M10 ; **M9** pour les produits finis (M11-12) ; **M10** pour les templates et le thème.
Bloque : M13 (tuile « stock produits finis » du tableau de bord).

## Points de vigilance
- **M11-04 et M11-06 documentent avant de coder** — c'est une règle non négociable de `CLAUDE.md`, et ce sont les deux seuls tickets du lot qui introduisent des formules.
- « Volume perdu » est un **changement de libellé**, pas de clé : aucune migration, aucun renommage de `deadspaceL`.
- La masse thermique est **conservée** : elle sert réellement aux rampes de chauffe du Jour J.
- Cadence checkpoint + feu vert après chaque ticket.
