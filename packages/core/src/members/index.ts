/**
 * Helpers **purs** membres & RGPD (M6-02). Zéro I/O, zéro horloge implicite : le
 * `now` est toujours **injecté** (déterminisme des tests). ADR-03 (core pur).
 *
 * - `deriveMembershipStatus` : statut de cotisation dérivé d'une période (M6-01).
 * - `resolveConsents`        : consentement courant depuis l'historique append-only.
 * - `anonymizeMember`        : patch d'anonymisation (pseudonymisation, §3.4).
 * - `buildMemberExport`      : assemblage du dossier d'export RGPD (droit d'accès).
 * - `normalizeMatchKey`      : normalisation pour le rapprochement de cotisation.
 */

import type { ConsentType, MembershipStatus } from "../schemas/enums.js";

/** Millisecondes dans un jour (période d'adhésion exprimée en jours, M6-01). */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Statut de cotisation dérivé : `A_JOUR` tant que `now` est dans la fenêtre
 * `[lastContributionAt, lastContributionAt + periodDays]` (borne haute incluse) ;
 * sinon `EN_RETARD`. `lastContributionAt` null (aucune cotisation) → `EN_RETARD`.
 *
 * `RangeError` si `periodDays` n'est pas un nombre fini > 0, ou si
 * `lastContributionAt` est une date invalide.
 */
export function deriveMembershipStatus(
  lastContributionAt: Date | null,
  periodDays: number,
  now: Date,
): MembershipStatus {
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    throw new RangeError("deriveMembershipStatus: periodDays doit être un nombre fini > 0.");
  }
  if (lastContributionAt === null) {
    return "EN_RETARD";
  }
  const last = lastContributionAt.getTime();
  if (Number.isNaN(last)) {
    throw new RangeError("deriveMembershipStatus: lastContributionAt est une date invalide.");
  }
  return now.getTime() <= last + periodDays * DAY_MS ? "A_JOUR" : "EN_RETARD";
}

/** Un événement de consentement historisé (append-only). */
export interface ConsentEvent {
  type: ConsentType;
  granted: boolean;
  at: Date;
}

/** État courant d'un consentement : dernier événement retenu pour un type. */
export interface CurrentConsent {
  granted: boolean;
  at: Date;
}

/** Les trois types de consentement RGPD (§3.4), pour itérer sur l'état complet. */
export const CONSENT_TYPES: readonly ConsentType[] = [
  "COMMUNICATION",
  "PHOTOS",
  "NOTIFICATIONS_LEGALES",
];

/**
 * Consentement courant par type : l'événement **le plus récent** (`at` max) fait
 * foi ; en cas d'égalité de date, le dernier de la liste (ordre d'ajout) l'emporte.
 * Un type jamais renseigné → `undefined` (aucun consentement exprimé).
 */
export function resolveConsents(
  events: readonly ConsentEvent[],
): Record<ConsentType, CurrentConsent | undefined> {
  const current: Record<ConsentType, CurrentConsent | undefined> = {
    COMMUNICATION: undefined,
    PHOTOS: undefined,
    NOTIFICATIONS_LEGALES: undefined,
  };
  for (const event of events) {
    const existing = current[event.type];
    if (existing === undefined || event.at.getTime() >= existing.at.getTime()) {
      current[event.type] = { granted: event.granted, at: event.at };
    }
  }
  return current;
}

/** Identité anonymisée d'un membre (PII effacées). */
export interface AnonymizedIdentity {
  firstName: string;
  lastName: string;
  email: null;
  phone: null;
  address: null;
  birthDate: null;
}

/**
 * Patch d'anonymisation **déterministe** (pseudonymisation, §3.4) : l'identité est
 * remplacée par des libellés neutres et toute PII est effacée. Ne touche **pas**
 * `memberNumber`, `membership`, `roles` ni les agrégats comptables (appliqués par
 * l'appelant). Aucun pseudonyme ré-identifiant (le `memberNumber` conservé suffit
 * à distinguer les dossiers).
 */
export function anonymizeMember(): AnonymizedIdentity {
  return {
    firstName: "Membre",
    lastName: "anonymisé",
    email: null,
    phone: null,
    address: null,
    birthDate: null,
  };
}

/** Identité exportée dans le dossier RGPD (droit d'accès). */
export interface ExportedIdentity {
  memberNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  birthDate: Date | null;
  membership: MembershipStatus;
}

/** Une cotisation rapprochée (agrégat comptable exporté). */
export interface ContributionRecord {
  amountCents: number;
  currency: string;
  occurredAt: Date;
  reference: string | null;
}

/** Référence d'audit liée au membre (piste conservée, §3.4). */
export interface AuditReference {
  action: string;
  at: Date;
  resourceType: string | null;
}

/** Entrée d'assemblage du dossier d'export RGPD. */
export interface MemberExportInput {
  member: ExportedIdentity;
  consents: readonly ConsentEvent[];
  contributions: readonly ContributionRecord[];
  auditTrail: readonly AuditReference[];
}

/** Dossier portable exporté (droit d'accès RGPD), structure versionnée. */
export interface MemberExport {
  schemaVersion: 1;
  member: ExportedIdentity;
  consents: {
    current: Record<ConsentType, CurrentConsent | undefined>;
    history: readonly ConsentEvent[];
  };
  contributions: readonly ContributionRecord[];
  auditTrail: readonly AuditReference[];
}

/**
 * Assemble le dossier portable d'un membre (demande d'accès RGPD) : identité,
 * consentements (courants résolus + historique), cotisations et piste d'audit.
 * Pur : ne lit rien, réordonne l'historique des consentements du plus ancien au
 * plus récent pour un export stable.
 */
export function buildMemberExport(input: MemberExportInput): MemberExport {
  const history = [...input.consents].sort((a, b) => a.at.getTime() - b.at.getTime());
  return {
    schemaVersion: 1,
    member: input.member,
    consents: {
      current: resolveConsents(history),
      history,
    },
    contributions: input.contributions,
    auditTrail: input.auditTrail,
  };
}

/**
 * Normalise une valeur (email ou nom) en **clé de rapprochement** : suppression
 * des diacritiques, minuscule, espaces réduits et rognés. Chaîne vide → `""`.
 */
export function normalizeMatchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marques diacritiques combinantes
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
