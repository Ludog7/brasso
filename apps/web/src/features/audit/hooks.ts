import { useQuery } from "@tanstack/react-query";

import { auditApi, type AuditListFilters } from "@/lib/api";

/** Clé de cache paramétrée par les filtres (pagination incluse). */
export const auditKeys = {
  list: (filters: AuditListFilters) => ["audit", "list", filters] as const,
};

/** Journal d'audit paginé/filtré (lecture seule). `enabled` : masqué hors rôle. */
export function useAuditLog(filters: AuditListFilters, enabled = true) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => auditApi.list(filters),
    enabled,
  });
}
