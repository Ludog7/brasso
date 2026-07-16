---
labels: web, feature, P1
milestone: M7 — Hub caisse & affichage
---
# M7-11 — web : exports CSV comptables (téléchargement)

## Contexte
La comptabilité associative exporte des CSV pour un outil externe (§Comptabilité associée). Ce ticket branche l'UI de téléchargement sur les endpoints d'export ({{M7-07}}) : ventes, cotisations, mouvements, sur une période. **Réutiliser les patterns** d'un feature web existant. SOURCE : `SPEC-FONCTIONNELLE.md` §Comptabilité associée ; `SPEC-ORCHESTRATION.md` §3.6.

## Objectif
Un `caisse`/`admin` choisit un type d'export et une période, et télécharge le CSV correspondant.

## Périmètre technique
- Fichiers/dossiers concernés : `apps/web/src/features/exports/` (`ExportsPanel.tsx` + `hooks.ts`, `labels.ts`), route `apps/web/src/routes/exports/…` (ou section de l'espace caisse), `apps/web/src/lib/api.ts` (helper de **téléchargement de fichier** : fetch authentifié → blob → `download`), tests `apps/web/src/test/exports.test.tsx`.
- Hors périmètre explicite : génération du CSV (API {{M7-07}}) ; anomalies/mapping.

## Spécification
- **UI** : sélecteur du type d'export (`sales` / `contributions` / `movements`), champs `from`/`to` (défaut mois courant), bouton « Télécharger le CSV ». Déclenche un téléchargement de fichier (nom depuis `Content-Disposition`), avec état de chargement et gestion d'erreur (403/plage invalide).
- **Téléchargement authentifié** : appeler l'endpoint avec les cookies de session (comme les autres appels), récupérer le blob `text/csv`, déclencher le download côté navigateur. Ne pas ouvrir dans un onglet non authentifié.
- **RBAC UI** : visible pour `caisse`/`brasseur`/`admin` ; masqué pour `rgpd`.
- **A11y/atelier** : cibles ≥ 48 px, contraste AA, mode sombre.

## Definition of Done
- [ ] Tests web (Vitest/RTL, faux `fetch` renvoyant un blob CSV) : sélection type + période → appel du bon endpoint avec `from`/`to` ; déclenchement du download (nom de fichier) ; état de chargement + erreur 403 ; RBAC UI (masqué pour `rgpd`)
- [ ] Lint + CI verte ; Prettier passé sur **tous** les fichiers touchés
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : télécharger un CSV de ventes sur une période depuis l'interface

## Dépendances
Bloqué par : {{M7-07}} — Bloque : —
