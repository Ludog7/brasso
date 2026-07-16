---
labels: web, feature, P0
milestone: M7 — Hub caisse & affichage
---
# M7-12 — web : configuration des écrans (surfaces, templates, sélection produits, mentions)

## Contexte
Le module d'affichage se configure depuis le front (§Module d'affichage) : définir des **surfaces** (Bar/Salle/Événement), des **écrans** (template liste/tableau/cartes, mentions légales), et **sélectionner les produits** affichés avec leurs indicateurs (`nouveau`/`coup de cœur`/`brassin spécial`). Consomme le CRUD affichage ({{M7-08}}). Matrice §3.5 : `affichage` = `admin` CRUD, `brasseur`/`caisse` RU. **Réutiliser les patterns** d'un feature web existant. SOURCE : `SPEC-FONCTIONNELLE.md` §Module d'affichage ; `SPEC-ORCHESTRATION.md` §3.5.

## Objectif
Un `admin` crée des surfaces et des écrans, choisit un template, sélectionne les produits à afficher avec leurs indicateurs, et rédige les mentions légales.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/display/` (`hooks.ts` + `displayKeys`, `labels.ts`, `SurfaceList.tsx`, `ScreenFormDialog.tsx`, `ScreenItemsEditor.tsx`, `TemplatePicker.tsx`), route `apps/web/src/routes/display/…`, entrée de navigation (masquée selon rôle), `apps/web/src/lib/api.ts` (`displayApi`), tests `apps/web/src/test/display.test.tsx`.
- Hors périmètre explicite : la **vue d'affichage temps réel** ({{M7-13}}) ; le rendu synchronisé au stock (API {{M7-08}}).

## Spécification
- **`displayApi`** : `listSurfaces()`, `createSurface`/`updateSurface`/`removeSurface`, `listScreens(surfaceId)`, `createScreen`/`updateScreen`/`removeScreen`, `setItems(screenId, items)`. Types miroir de {{M7-08}}.
- **`SurfaceList`** : surfaces avec leurs écrans ; création/édition/suppression (nom libre, description).
- **`ScreenFormDialog`** : nom d'écran, `TemplatePicker` (`LIST`/`TABLE`/`CARDS`), `legalMentions` (zone de texte — messages alcool/allergènes), `isActive`.
- **`ScreenItemsEditor`** : sélectionner des produits du catalogue (conditionnés), poser les flags `isNew`/`isFavorite`/`isSpecial`, un `priceCents` optionnel, et un `sortOrder` (boutons monter/descendre, **pas de drag-and-drop** — contrainte atelier §6). `PUT items` remplace la sélection.
- **RBAC UI** : `admin` = CRUD complet ; `brasseur`/`caisse` = lecture + mise à jour (RU, pas de création/suppression de surface/écran) ; `rgpd` = masqué.
- **A11y/atelier** : cibles ≥ 48 px, contraste AA, mode sombre, zéro drag-and-drop.

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch`) : CRUD surface/écran ; choix de template ; édition de la sélection de produits (flags + tri par boutons) ; saisie des mentions légales ; RBAC UI (`admin` CRUD ; `brasseur`/`caisse` RU ; `rgpd` masqué)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : configurer une surface « Bar » + un écran « cartes » avec 3 produits (dont un « coup de cœur ») et des mentions légales

## Dépendances
Bloqué par : {{M7-08}} — Bloque : {{M7-13}}
