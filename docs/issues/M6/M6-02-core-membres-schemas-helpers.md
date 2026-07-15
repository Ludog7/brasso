---
labels: core, feature, P0
milestone: M6 — Membres & RGPD
---
# M6-02 — core : schémas Zod membres/consentements + helpers purs (statut dérivé, consentement courant, anonymisation, export)

## Contexte
Avant les routes API M6 (M6-03+), `@brasso/core` doit exposer les **schémas Zod partagés** (ADR-04 : Zod vit dans `core`, valeurs d'enum **recopiées** de Prisma, aucun import DB) et les **calculs purs** RGPD/membres réutilisés partout, sans dépendance DB/UI (ADR-03) : dérivation du **statut de cotisation** depuis une période (M6-01), résolution du **consentement courant** depuis un historique append-only (`MemberConsent`, §3.4), **transformée d'anonymisation** (pseudonymisation post-délai légal, §3.4), assemblage du **dossier d'export** RGPD, et **normalisation** pour le rapprochement de cotisation. SOURCE : `SPEC-ORCHESTRATION.md` §3.4 ; `SPEC-FONCTIONNELLE.md` §Membres & RGPD ; §6 « RGPD by design » (minimisation, consentements historisés, anonymisation testée).

## Objectif
`@brasso/core` expose un module `members/` (helpers purs) et `schemas/member.ts` (Zod) consommables par l'API M6, avec couverture ≥ 90 %.

## Périmètre technique
- Fichiers/dossiers concernés : `packages/core/src/members/index.ts` (nouveau), `packages/core/src/schemas/member.ts` (nouveau), extension `packages/core/src/schemas/enums.ts` (enums membres recopiés), exports `schemas/index.ts` + index racine `core`, tests `packages/core/tests/`.
- Hors périmètre explicite : persistance/routes (M6-03+), audit (effet de bord → {{M6-03}}), UI (M6-09/10). Aucune I/O, aucune horloge implicite (le `now` est **injecté** en paramètre — déterminisme des tests).

## Spécification
- **Enums Zod recopiés** (`schemas/enums.ts`, valeurs identiques à Prisma) : `consentTypeSchema` (`COMMUNICATION`|`PHOTOS`|`NOTIFICATIONS_LEGALES`), `associativeRoleSchema` (`ADHERENT`|`BRASSEUR`|`CA`|`TRESORIER`|`REFERENT_RGPD`), `membershipStatusSchema` (`A_JOUR`|`EN_RETARD`).
- **Schémas** (`schemas/member.ts`) :
  - `memberCreateSchema` : `firstName`/`lastName` (non vides), `memberNumber` (non vide), `email?` (email), `phone?`, `address?`, `birthDate?` (date ; **minimisation** : optionnel, §6), `roles?` (`associativeRoleSchema[]`, défaut `[]`).
  - `memberUpdateSchema` : `memberCreateSchema.partial()` (au moins un champ ; `memberNumber` **non modifiable** → l'omettre du schéma d'update ou le rejeter).
  - `consentInputSchema` : `{ type: consentTypeSchema, granted: boolean }` (un événement de consentement).
- **Helpers purs** (déterministes) :
  - `deriveMembershipStatus(lastContributionAt: Date | null, periodDays: number, now: Date): "A_JOUR" | "EN_RETARD"` — `A_JOUR` ssi `lastContributionAt != null` **et** `now ≤ lastContributionAt + periodDays`. `RangeError` si `periodDays ≤ 0` ou entrées non finies. `lastContributionAt` null → `EN_RETARD`.
  - `resolveConsents(events: { type: ConsentType; granted: boolean; at: Date }[]): Record<ConsentType, { granted: boolean; at: Date } | undefined>` — pour chaque type, l'événement **le plus récent** (`at` max) fait foi (historique append-only). Type absent → `undefined` (jamais consenti).
  - `anonymizeMember(member): { firstName; lastName; email; phone; address; birthDate }` — **patch d'anonymisation** déterministe : `firstName = "Membre"`, `lastName = "anonymisé·e"` (ou pseudonyme dérivé du `memberNumber`), `email/phone/address/birthDate = null`. Ne touche **pas** `memberNumber`, `membership`, `roles`, ni les agrégats comptables. Fonction pure (renvoie le patch, n'écrit rien).
  - `buildMemberExport(input): MemberExport` — assemble le **dossier portable** (demande d'accès RGPD) : identité, `consents` (courants résolus + historique brut), `contributions` (cotisations rapprochées : montant/date/référence), `auditTrail` (entrées d'audit liées au membre). Structure JSON stable, versionnée (`schemaVersion`).
  - `normalizeMatchKey(value: string): string` — minuscule, `trim`, suppression des accents/diacritiques et espaces multiples → clé de rapprochement d'email/nom (M6-08). Chaîne vide → `""`.
- Types inférés exportés (`MemberCreateInput`, `MemberUpdateInput`, `ConsentInput`, `MemberExport`) réutilisables par l'API.

## Definition of Done
- [ ] Tests : `deriveMembershipStatus` (A_JOUR dans la période, EN_RETARD au-delà et si `null`, `RangeError` sur `periodDays ≤ 0`, borne exacte `now == last + period`) ; `resolveConsents` (dernier événement par type, type absent→undefined, retrait après octroi) ; `anonymizeMember` (PII effacées, `memberNumber`/agrégats préservés, déterministe) ; `buildMemberExport` (dossier complet, structure stable) ; `normalizeMatchKey` (accents/casse/espaces)
- [ ] Couverture `core` ≥ 90 % maintenue
- [ ] Lint + CI verte ; Prettier passé
- [ ] Pas de régression sur les tests existants
- [ ] Critère fonctionnel observable : l'API M6 peut valider une saisie membre/consentement et dériver statut + consentement courant + dossier d'export + patch d'anonymisation à partir de `@brasso/core` seul

## Dépendances
Bloqué par : {{M1-01}}, {{M6-01}} — Bloque : {{M6-03}}, {{M6-04}}, {{M6-05}}, {{M6-06}}, {{M6-07}}, {{M6-08}}
