import type { ConsentType } from "@brasso/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type MemberCreateInput,
  type MemberListFilters,
  membersApi,
  type MemberUpdateInput,
} from "@/lib/api";

/** Clés de cache : racine `members` pour invalider large après écriture. */
export const memberKeys = {
  all: ["members"] as const,
  list: (filters: MemberListFilters) => ["members", "list", filters] as const,
  detail: (id: string) => ["members", "detail", id] as const,
  consents: (id: string) => ["members", "consents", id] as const,
};

/**
 * Liste filtrable (recherche nom/numéro/email + statut de cotisation). `enabled`
 * permet de ne pas requêter quand l'écran est masqué (rôle non habilité).
 */
export function useMembers(filters: MemberListFilters, enabled = true) {
  return useQuery({
    queryKey: memberKeys.list(filters),
    queryFn: () => membersApi.list(filters),
    enabled,
  });
}

/** État courant + historique des consentements d'un membre. */
export function useMemberConsents(id: string) {
  return useQuery({
    queryKey: memberKeys.consents(id),
    queryFn: () => membersApi.consents(id),
  });
}

function useInvalidateMembers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: memberKeys.all });
}

export function useCreateMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (input: MemberCreateInput) => membersApi.create(input),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateMember(id: string) {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (input: MemberUpdateInput) => membersApi.update(id, input),
    onSuccess: () => void invalidate(),
  });
}

export function useSetConsent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: ConsentType; granted: boolean }) =>
      membersApi.setConsent(id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: memberKeys.consents(id) }),
  });
}

/** Anonymisation RGPD (irréversible) : rafraîchit la liste (PII effacées). */
export function useAnonymizeMember(id: string) {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: () => membersApi.anonymize(id),
    onSuccess: () => void invalidate(),
  });
}
