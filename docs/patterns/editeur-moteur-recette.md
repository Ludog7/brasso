# Pattern — éditeur de recette par moteur (BEER / ALT_FERMENTED / SOFT_DRINK)

> **À lire avant tout ticket d'éditeur moteur.** Ce document codifie le pattern
> stable partagé par les éditeurs de recette du front (`apps/web`). But : partir
> d'**un seul document** au lieu de reverse-engineer l'éditeur précédent + les
> schémas dispersés. Il n'altère pas le workflow ticket (le ticket garde périmètre
> et DoD) — il supprime la redécouverte.
>
> **Référence canonique :** `apps/web/src/features/recipes/alt/` (moteur ALT, ADR-11).
> **Autre exemple :** `apps/web/src/features/recipes/beer/` (jauges BJCP).
> **Restant :** SOFT_DRINK (même pattern, ADR-11).

## 1. Squelette de fichiers

Un éditeur moteur vit dans `apps/web/src/features/recipes/<engine>/` :

| Fichier | Rôle |
|---|---|
| `mapToEngine.ts` | **Cœur** : projections pures éditeur ↔ moteur `@brasso/core` ↔ persistance. Aucune formule (règle `FORMULES-BRASSICOLES.md`). |
| `<Engine>DetailsForm.tsx` | Champs scalaires persistés (détail moteur). |
| `<Engine>IngredientsEditor.tsx` | Sections d'ingrédients par catégorie pertinente. |
| `<Engine>StepsEditor.tsx` | Étapes de process (types restreints au moteur). |
| `<Panneau>.tsx` | Sortie temps réel du moteur (`PredictionPanel` BEER / `IndicatorPanel` ALT). |
| `<Engine>Editor.tsx` | Orchestrateur : état, dirty, sauvegarde, layout 2 colonnes. |

**Aiguillage** : ajouter la branche dans `apps/web/src/routes/recipes/RecipeEditorPage.tsx`
(`if (recipe.data.engine === "<ENGINE>") return <XxxEditor …/>`). Le
`GenericEngineEditor` (shell M2-05) est le repli des moteurs sans éditeur dédié.

**Réutilisables partagés** (ne pas dupliquer) :
- `../EditorHeader` — en-tête (nom, moteur, statut, version, retour, slot droit).
- `../hooks` — `useSaveRecipeDraft` (PATCH détails + PUT ingrédients + PUT étapes),
  `useBjcpStyles`, `useCatalogItems`.
- `../useBeforeUnload` — garde de navigation sur `dirty`.
- `../beer/RowField`, `../beer/CatalogPicker` — primitives génériques d'éditeur
  (sans logique propre à un moteur), réutilisables telles quelles.
- `../labels` — `DRINK_TYPES`, `ENGINE_LABELS`, `STATUS_LABELS`.

## 2. Contrat `mapToEngine.ts`

L'état d'édition est **saisi en chaînes** (champs contrôlés). Fonctions attendues :

- `<engine>StateFromRecipe(recipe): <Engine>FormState` — dérive l'état depuis la
  recette chargée (`RecipeDetail`). Lit les `params` JSONB via un helper `readNum`.
- `to<Engine>Recipe(state, …): <Engine>Recipe` — projette vers l'entrée pure de
  `@brasso/core` (jamais de calcul stocké : tout reste dérivé).
- `toIngredientInputs(state): RecipeIngredientInput[]` — filtrées par `named`
  (une ligne compte dès qu'elle porte un nom), unités internes (g).
- `toStepInputs(state): RecipeStepInput[]` — `params` construits par type d'étape
  (aligné sur `stepParamsSchemaByType`, cf. §4).
- `<engine>DetailsPatch(state): Partial<XxxDetails>` — patch du détail persisté.
- Fabriques `emptyXxx()` + `newRowKey(prefix)` (clé stable indépendante de l'index).

**Détection du `dirty`** : une `draftSignature(state)` = `JSON.stringify` des champs
**persistés** (ignore les clés de ligne + l'état d'estimation). `dirty` = signature
courante ≠ baseline (signature de `stateFromRecipe(recipe)`).

**Séparation persisté ↔ estimation** : si le panneau a besoin d'entrées que le
détail moteur **ne persiste pas** (cf. tableau §5), les mettre dans un `useState`
**séparé** (ex. `AltEstimationInputs`) — transientes, hors `draftSignature`, hors
sauvegarde. Les afficher comme « hypothèses d'estimation (non enregistrées) ».
Étendre la persistance = **ticket API** (schéma Prisma + Zod core + service), jamais
dans un ticket `web`.

## 3. Orchestrateur `<Engine>Editor.tsx`

- `state` via `useState(() => stateFromRecipe(recipe))` ; resync **après montage
  seulement** (garder un `syncedRef` sur `${id}:${updatedAt}`) pour ne pas régénérer
  les clés de ligne pendant la saisie.
- Temps réel : `const deferred = useDeferredValue(state)` puis `useMemo` →
  `compute<Engine>(to<Engine>Recipe(deferred, …))`.
- `readOnly = recipe.status !== "DRAFT"` → tout désactivé + bandeau lecture seule.
- Sauvegarde unique via `useSaveRecipeDraft` : `{ update: { name, notes, <engine>Details }, ingredients, steps }`.
- Layout : `grid lg:grid-cols-[minmax(0,1fr)_360px]` (formulaire à gauche, panneau à droite).

## 4. Cheat-sheet `@brasso/core` par moteur

| Besoin | Symbole |
|---|---|
| Moteur | `computeBeer` · `computeAltFermented` · `computeSoftDrink` (dispatcher `computeRecipe`) |
| Catégories d'ingrédient permises | `ingredientCategoriesByEngine[engine]` |
| Types d'étape permis | `stepTypesByEngine[engine]` |
| Schéma `params` d'une étape | `stepParamsSchemaByType[type]` |
| Règles de publication (ADR-06) | `recipePublicationCheck` → `{ publishable, errors }` (messages ADR-11 prêts à afficher) |
| **ADR-11** pH / sécurité | `PH_LOW_ACID_THRESHOLD` (4.6), `phIndicator`, `FOOD_SAFETY_DISCLAIMER`, `PhStatus` |
| Jauges (BEER) | `gaugeStatus` (`below`/`in_range`/`above`/`unknown`), `ebcToHex` |
| Enums UI | `stabilizationMethodSchema.options`, `storageModeSchema` |

Types clés : `RecipeIngredientInput`, `RecipeStepInput`, `BeerRecipe`/`AltRecipe`/`SoftRecipe`,
`StabilizationMethod`, `StorageMode`, `BjcpStyle`, `CatalogItem`.

## 5. Persistance par moteur — ce qui est stocké vs dérivé/estimé

Tables `RecipeXxxDetails` (`packages/db/prisma/schema.prisma`) miroitées par
`apps/web/src/lib/api.ts`. **Ce qui n'est pas une colonne ne se persiste pas** :

| Moteur | Colonnes persistées (`RecipeXxxDetails`) | Dérivé / estimé (non persisté) |
|---|---|---|
| **BEER** | `styleBjcp, targetOg, targetFg, targetIbu, targetEbc, boilTimeMin, efficiency, batchVolumeL` | OG/FG/ABV/IBU/EBC **dérivés** du grist (jamais saisis comme vérité) |
| **ALT_FERMENTED** | `baseType, targetPh, stabilizationMethod, residualSugarRisk, batchVolumeL` | OG/FG, `storageMode`, `maxTempC` → **estimation** (panneau, transient) |
| **SOFT_DRINK** | `sugarConcentration, targetPh, storageMode, stabilizationMethod, batchVolumeL` | (voir `engines/softDrink.ts` pour la sortie exacte) |

Catégories / étapes permises (`recipeParts.ts`) :
- BEER : `MALT SUGAR HOP YEAST ADJUNCT` · étapes `MASH…FERMENT CONDITION PACKAGE OTHER`.
- ALT : `SUGAR YEAST ADJUNCT` · étapes `BOIL COOL FERMENT STABILIZE CONDITION PACKAGE OTHER`.
- SOFT : `SUGAR ADJUNCT` · étapes `BOIL COOL STABILIZE PACKAGE OTHER`.

## 6. Règles de patch (détail moteur) & gotchas

- Le patch de mise à jour = `xxxDetailsSchema.partial()` côté API ; le corps est
  `.strict()` → **envoyer le détail d'un autre moteur = 400**.
- **`nullish()`** (ex. `stabilizationMethod`) : envoyer `null` **efface** ; **`optional()`
  non-nullable** (ex. `targetPh`, `batchVolumeL`) : **omettre** si vide (ne jamais
  envoyer `null`). `baseType` = `z.string().min(1)` → omettre plutôt qu'envoyer `""`.
- `batchVolumeL` : n'inclure que si `> 0` (`z.number().positive()`).
- **Gotcha calcul** : `realAttenuation`/`realEfficiency` **lèvent** si `OG ≤ 1.000`.
  Si le moteur exige og/fg mais qu'ils sont optionnels côté UI, passer un **repli
  neutre > 1** et n'**afficher** ABV/atténuation qu'une fois les densités saisies.
- **Unités internes** partout : g, L, SG brute (`1.052`), EBC, α en **fraction**
  (`0.062`) — conversions uniquement dans `packages/core/src/units.ts`.

## 7. Wording ADR-11 (écrans pH / stabilisation)

Sur tout écran pH/stabilisation : parler d'**« indicateur d'aide à la décision »**,
**jamais** « conforme » / « sûr ». Afficher `FOOD_SAFETY_DISCLAIMER` en permanence.
Bandeau publication : réutiliser `recipePublicationCheck(...).errors` (déjà rédigés
ADR-11). Masquer IBU/EBC pour ALT/SOFT (grist non pertinent).

## 8. Gabarit de test (`apps/web/src/test/<engine>-editor.test.tsx`)

Calquer `alt-editor.test.tsx` / `beer-editor.test.tsx` :

- **Harness** : `vi.stubGlobal("fetch", …)` répondant à `/auth/me`, `/api/catalog-items`,
  `GET /api/recipes/:id`, `PATCH` (merge du détail moteur), `PUT …/ingredients`,
  `PUT …/steps` (avec `touch()` sur `updatedAt`). Rendre `<App>` sous
  `QueryClientProvider` + `MemoryRouter initialEntries={["/recipes/r1/edit"]}`,
  `useSession.setState({ user: null })`.
- **Assertions temps réel** : `data-testid` sur chaque métrique ; vérifier qu'elles
  reflètent le core (valeurs de référence `FORMULES-BRASSICOLES.md` pour BEER ;
  seuil pH / risque pour ALT/SOFT).
- **ADR-11** : scanner `document.querySelector("main")?.textContent` → **pas** de
  `/conforme/i` ni `/\bsûre?\b/i` ; disclaimer présent ; IBU/EBC absents (`/\bIBU\b/`,
  `/\bEBC\b/`).
- **Sauvegarde** : après édition, cliquer « Enregistrer », attendre « Modifications
  enregistrées », inspecter le `PATCH`/`PUT` capturé.

## 9. Checklist d'un nouvel éditeur moteur

1. `mapToEngine.ts` (state, projections, patch, fabriques) — cf. §2/§5/§6.
2. `<Engine>DetailsForm`, `<Engine>IngredientsEditor`, `<Engine>StepsEditor`, panneau.
3. `<Engine>Editor` (orchestrateur) — cf. §3.
4. Brancher dans `RecipeEditorPage` + ajuster le commentaire du `GenericEngineEditor`.
5. Test dédié — cf. §8.
6. `pnpm --filter @brasso/web {typecheck,lint,test,build}` verts.
