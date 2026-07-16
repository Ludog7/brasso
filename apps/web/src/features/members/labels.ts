/**
 * Libellés FR du fichier membres (M6-09) : statut de cotisation, rôles associatifs
 * (≠ rôles RBAC), types de consentement RGPD. Ordres d'itération stables pour un
 * rendu déterministe.
 */

import type { AssociativeRole, ConsentType, MembershipStatus } from "@brasso/core";

export const MEMBERSHIP_LABELS: Record<MembershipStatus, string> = {
  A_JOUR: "À jour",
  EN_RETARD: "En retard",
};

export const ASSOCIATIVE_ROLES: AssociativeRole[] = [
  "ADHERENT",
  "BRASSEUR",
  "CA",
  "TRESORIER",
  "REFERENT_RGPD",
];

export const ASSOCIATIVE_ROLE_LABELS: Record<AssociativeRole, string> = {
  ADHERENT: "Adhérent",
  BRASSEUR: "Brasseur",
  CA: "Conseil d'administration",
  TRESORIER: "Trésorier",
  REFERENT_RGPD: "Référent RGPD",
};

export const CONSENT_TYPES: ConsentType[] = ["COMMUNICATION", "PHOTOS", "NOTIFICATIONS_LEGALES"];

export const CONSENT_LABELS: Record<ConsentType, string> = {
  COMMUNICATION: "Communications",
  PHOTOS: "Droit à l'image (photos)",
  NOTIFICATIONS_LEGALES: "Notifications légales",
};
