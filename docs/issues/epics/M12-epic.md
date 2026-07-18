---
labels: feature, P1
milestone: M12 — Vie associative
epic: true
---
# M12 — Vie associative : membres, cotisations & communication (epic)

## Contexte
Quatrième milestone du dev step 2 (SPEC-ORCHESTRATION §9 ; brief §3.F, §3.G). Le test réel a montré qu'un membre nouvellement créé est marqué « en retard » **sans qu'aucun champ ne permette d'acquitter sa cotisation ni de fixer sa date anniversaire**, et que le volet **Cotisations reste vide même après création d'un membre** — le lien entre les deux volets est à revoir.

S'y ajoutent les champs manquants du fichier membre (numéro auto, majeur/mineur, âge, adresse détaillée, photo), une logique de statut à **4 couleurs**, et le double opt-in email conditionné à l'activation du service (D4, M10).

## Objectif
Rendre le fichier membre exploitable au quotidien : saisie complète, statut lisible d'un coup d'œil, échéance à 12 mois, et cotisations effectivement rattachées.

## Critère de démo
Créer une adhésion avec **numéro proposé automatiquement**, adresse détaillée et opt-in email ; recevoir et valider le mail de confirmation faisant passer le membre de **JAUNE à VERT** ; constater le passage en **ORANGE** à un mois de l'échéance puis en **ROUGE** au-delà ; et retrouver la cotisation acquittée dans le volet Cotisations, rattachée au bon membre.

## Sous-tickets
{{CHECKLIST}}

## Inventaire prévisionnel
> Corps détaillés rédigés à la fin de M11 (§5.5).

| Ticket | Domaine | Périmètre |
|---|---|---|
| **M12-01** | `db` | Migration « fichier membre » : adresse détaillée (rue, ville, code postal) **remplaçant** le champ `address` mono-champ (migration de données incluse), photo, acquittement de cotisation, date anniversaire d'adhésion, jeton de validation d'email. |
| **M12-02** | `core` | Logique de **statut à 4 couleurs**, pure et testée : **VERT** (adhésion complète et à jour), **JAUNE** (email non validé / opt-in en attente), **ORANGE** (< 1 mois avant échéance), **ROUGE** (hors date). Période **12 mois** dérivée de `Settings.membershipPeriodDays` (**existant**), jamais codée en dur (ADR-01). Calcul de l'**âge** et du caractère **majeur/mineur** à date. |
| **M12-03** | `api` | Numéro d'adhérent : proposition **+1 du dernier utilisé**, modifiable, unicité garantie **en concurrence** (deux créations simultanées ne doivent pas produire le même numéro). |
| **M12-04** | `api` | Acquittement de cotisation et date anniversaire ; **réparation du lien Cotisations ↔ Membres** (bug §3.G) ; articulation avec le rapprochement HelloAsso existant (M6). |
| **M12-05** | `api` | Photo de membre : stockage **blob local** (volume de la VM, ni base ni stockage objet externe), consentement via le `MemberConsent.PHOTOS` **existant**, purge à la radiation et à l'anonymisation, inclusion dans l'export RGPD. |
| **M12-06** | `api` | Emails sortants : SMTP en **variables d'environnement uniquement**, double opt-in par jeton **à usage unique et expirant**, statut JAUNE tant que l'adresse n'est pas validée. Service **optionnel** (D4) : désactivé, l'envoi est simplement indisponible, sans rien casser. |
| **M12-07** | `web` | Formulaire membre : numéro pré-rempli, adresse détaillée, date de naissance avec **âge affiché**, indicateur majeur/mineur, photo, opt-in email. |
| **M12-08** | `web` | Liste des membres : **pastilles de statut à 4 couleurs** (jamais la couleur seule — accessibilité AA), filtres par statut, et **responsive du panneau membre** (point explicitement relevé au test réel, §3.F). |
| **M12-09** | `web` | Volet Cotisations : suivi et administration, rattachement au membre, historique et acquittement manuel. |

## Dépendances
Bloqué par : validation de la démo M11 ; **M10** pour l'activation du service email (D4) et le thème. S'appuie sur **M6** (membres, consentements, webhook HelloAsso, AuditLog) qui reste la fondation — ce milestone l'étend, ne le refait pas.
Bloque : M13 (tuiles du tableau de bord alimentées par la vie associative).

## Points de vigilance
- **RGPD** : la date de naissance devient nécessaire (contrôle majeur/mineur pour la consommation d'alcool) — la **finalité doit être documentée**, la minimisation de §6 l'exigeait jusqu'ici. La photo est facultative, sous consentement explicite et purgée à la radiation.
- Le statut est **dérivé** de la période et de la dernière cotisation (décision M6 déjà actée) : `Member.membership` reste un cache, jamais la source de vérité.
- La migration de `address` vers une adresse détaillée doit **transporter les données existantes**, pas les perdre.
- Cadence checkpoint + feu vert après chaque ticket.
