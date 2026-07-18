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
| **M10-03** | `adr` | **ADR-14** (amende ADR-05) — thème **clair par défaut** + thème dérivé d'une couleur de marque. ⚠️ Contradiction directe à trancher : ADR-05 et §6 imposent « mode sombre par défaut ». Traiter l'impact sur le contraste AA en atelier. |
| **M10-04** | `db` | Migration « options & identité » : champs `Settings` (apparence, services, géolocalisation météo, templates), `User.pinHash` + métadonnées de verrouillage. |
| **M10-05** | `api` | Module `settings` : lecture/écriture des options générales sous RBAC `parametres` ; secrets **jamais** en base (SMTP en variables d'environnement). |
| **M10-06** | `api` | Bascule d'utilisateur par PIN : pose/réinitialisation du PIN, ré-authentification, session courte, verrouillage auto, **rate-limit et blocage** (ADR-13). |
| **M10-07** | `web` | Fondations design system : jetons de thème, dérivation de la couleur de contraste depuis la couleur de marque, bascule clair/sombre, primitives d'**états vides / chargement / erreur** réutilisables. Socle du fil rouge UX (§4). |
| **M10-08** | `web` | Volet « Options générales » : sous-volets Apparence, Accès (**restitution en lecture** de la matrice), Services, Templates. |
| **M10-09** | `web` | Bandeau : logo, nom de la brasserie, **badge de l'utilisateur actif**, bascule d'utilisateur en 2 clics + saisie du PIN. |
| **M10-10** | `web` | Application homogène du thème à l'existant + passe responsive et états vides sur les écrans déjà livrés. |

## Dépendances
Bloqué par : validation de la démo M9. **M10-01 à M10-03 (ADR) bloquent tous les autres tickets du milestone** — aucune implémentation ne démarre avant que les ADR correspondants soient tranchés et écrits dans `docs/adr/`.
Bloque : M11 (templates de cartes du bar), M12 (services email), M13 (ressources RBAC `taches` et `agenda`).

## Points de vigilance
- **Question remontée, non tranchée** (§9.2 Q9) : le brief nomme le profil « trésorier », le code porte `caisse`. Recommandation — conserver la clé `caisse`, n'ajuster que le libellé affiché. **À confirmer par Ludo avant M10-01.**
- Le PIN est une commodité qui **abaisse** le niveau d'authentification : rate-limit et blocage ne sont pas optionnels.
- Le sous-volet « Accès » **restitue** la matrice, il ne l'édite pas : ne pas laisser l'UI suggérer une modification impossible.
- Cadence checkpoint + feu vert après chaque ticket.
