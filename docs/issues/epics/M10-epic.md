---
labels: feature, P0
milestone: M10 — Socle transverse : options, apparence & identité
epic: true
---
# M10 — Socle transverse : options, apparence & identité (epic)

## Contexte
Deuxième milestone du dev step 2 (SPEC-ORCHESTRATION §9, brief §3.B). Verdict du premier test d'usage : l'application est « globalement assez basique et peu esthétique ». Ce milestone pose le **socle transverse** — volet « Options générales », thème dérivé d'une couleur de marque, identité de la brasserie dans le bandeau, bascule d'utilisateur type caisse — et les fondations du design system sur lesquelles s'appuieront tous les écrans ultérieurs.

Il est placé **tôt** délibérément : repeindre après coup les écrans de M11 à M13 coûterait deux fois le prix.

## Objectif
Doter l'application d'un socle de configuration, d'identité visuelle et d'accès partagé, appliqué de façon homogène.

## Critère de démo
La brasserie configure son **nom, son logo et sa couleur de marque** dans les Options générales et les retrouve appliqués à tout l'écran (bandeau, tonalités, lignes) en clair comme en sombre ; sur le poste partagé de l'atelier, on **bascule d'utilisateur en 2 clics avec un code PIN**, le badge de l'utilisateur actif restant visible en permanence.

## Sous-tickets
{{CHECKLIST}}

## Inventaire prévisionnel
> Corps détaillés rédigés à la fin de M9 (§5.5) — le périmètre ci-dessous est arrêté, la formulation fine intégrera les enseignements de M9.

| Ticket | Domaine | Périmètre |
|---|---|---|
| **M10-01** | `adr` | **ADR-12** — extension de la matrice RBAC §3.5 : ressources `taches` et `agenda`, élargissement de `parametres`. Acte « presets lisibles, matrice **non éditable** » (§9.2 Q9) et réaffirme le deny-by-default. **Prérequis de tout le milestone.** |
| **M10-02** | `adr` | **ADR-13** (amende ADR-10) — bascule d'utilisateur par PIN : PIN Argon2id, session courte, verrouillage automatique, rate-limit et blocage après N échecs. |
| **M10-03** | `adr` | **ADR-14** (amende ADR-05) — thème **clair par défaut**, **bascule clair/sombre dans les Options**, thème dérivé d'une couleur de marque. **Sens tranché par Ludo** (2026-07-18) ; le ticket rédige l'ADR et met la spec en cohérence. ⚠️ Amender **deux** emplacements : ADR-05 (§0) **et** §6, qui imposent tous deux « mode sombre par défaut ». Contrainte : **contraste AA dans les deux thèmes**. |
| **M10-04** | `db` | Migration « options & identité » : champs `Settings` (apparence, services, géolocalisation météo, templates), `User.pinHash` + métadonnées de verrouillage. |
| **M10-05** | `api` | Module `settings` : lecture/écriture des options générales sous RBAC `parametres` ; secrets **jamais** en base (SMTP en variables d'environnement). |
| **M10-06** | `api` | Bascule d'utilisateur par PIN : pose/réinitialisation du PIN, ré-authentification, session courte, verrouillage auto, **rate-limit et blocage** (ADR-13). |
| **M10-07** | `web` | Fondations design system : jetons de thème (**en clair**, le défaut ayant déjà été basculé en dur), primitives d'**états vides / chargement / erreur** réutilisables. Socle du fil rouge UX (§4). ⚠️ La bascule clair/sombre et la dérivation de marque **ne sont plus ici** → M10-11. |
| **M10-08** | `web` | Volet « Options générales » : sous-volets Apparence, Accès (**restitution en lecture** de la matrice, rôle `caisse` affiché « **Trésorier / Caisse** »), Services, Templates. ⚠️ La **bascule clair/sombre** n'est plus ici → M10-11. |
| **M10-09** | `web` | Bandeau : logo, nom de la brasserie, **badge de l'utilisateur actif**, bascule d'utilisateur en 2 clics + saisie du PIN. |
| **M10-10** | `web` | Application homogène du thème à l'existant + passe responsive et états vides sur les écrans déjà livrés. |
| **M10-11** | `web` | **Clôture du milestone** : bascule clair/sombre configurable et persistée + dérivation du thème depuis la couleur de marque (contraste AA dans les deux thèmes). Reprend ce que M10-07/M10-08 portaient avant l'arbitrage du 2026-07-20. |

## Dépendances
Bloqué par : validation de la démo M9. **M10-01 à M10-03 (ADR) bloquent tous les autres tickets du milestone** — aucune implémentation ne démarre avant que les ADR correspondants soient tranchés et écrits dans `docs/adr/`.
Bloque : M11 (templates de cartes du bar), M12 (services email), M13 (ressources RBAC `taches` et `agenda`).

## Points de vigilance
- **Tranché** (§9.2 Q9, Ludo le 2026-07-18) : la clé **`caisse` est conservée** ; seul le **libellé affiché** devient « Trésorier / Caisse » (M10-08). Aucune migration, aucun changement de `Role.key`, aucun impact RBAC — ne pas transformer un libellé en renommage de clé.
- **Tranché** : thème **clair par défaut**, **basculable clair/sombre dans les Options**. Le mode sombre n'est pas retiré, il devient un choix utilisateur.
- **Tranché** (Ludo, 2026-07-20) : le **défaut clair est appliqué « dans le dur » dès le début du milestone**, sans attendre la bascule configurable — pour que tout le travail d'interface de M10 soit jugé dans le thème cible plutôt que réévalué après coup. Corollaire : la **bascule configurable et la dérivation de marque quittent M10-07/M10-08** pour le ticket de clôture **M10-11**. ADR-14 **ratifie** donc un défaut déjà appliqué : l'inversion d'ordre est délibérée et datée, elle doit être écrite dans l'ADR.
- **Tranché** (Ludo, 2026-07-20) : `parametres` est **scindé** — `parametres` (admin CRUD, comptes) et **`options`** (read 4 rôles, update admin). L'écran de **connexion affiche nom et logo**, le sous-ensemble public étant borné à **trois champs** nommés.
- **Tranché** (Ludo, 2026-07-20) : **tous** les rôles basculent par PIN — **4 chiffres**, **6 pour `admin`**. Poste ouvert, environnement contrôlé.
- Le PIN est une commodité qui **abaisse** le niveau d'authentification : rate-limit et blocage ne sont pas optionnels.
- Le sous-volet « Accès » **restitue** la matrice, il ne l'édite pas : ne pas laisser l'UI suggérer une modification impossible.
- Cadence checkpoint + feu vert après chaque ticket.
