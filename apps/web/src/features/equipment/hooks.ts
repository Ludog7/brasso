import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  equipmentApi,
  type EquipmentCreateInput,
  type EquipmentListFilters,
  type EquipmentProfile,
  type EquipmentUpdateInput,
} from "@/lib/api";

/** Fabrique de clés de cache : une racine `equipment` pour invalider large. */
export const equipmentKeys = {
  all: ["equipment"] as const,
  list: (filters: EquipmentListFilters) => ["equipment", "list", filters] as const,
  detail: (id: string) => ["equipment", "detail", id] as const,
};

/** Liste des profils d'équipement, filtrable actif/inactif (côté API). */
export function useEquipmentProfiles(filters: EquipmentListFilters = {}) {
  return useQuery({
    queryKey: equipmentKeys.list(filters),
    queryFn: () => equipmentApi.list(filters),
  });
}

/** Détail d'un profil (préremplit le formulaire d'édition). */
export function useEquipmentProfile(id: string | undefined) {
  return useQuery({
    queryKey: equipmentKeys.detail(id ?? ""),
    queryFn: () => equipmentApi.get(id as string),
    enabled: Boolean(id),
  });
}

/** Création d'un profil → invalide les listes ; renvoie le profil créé. */
export function useCreateEquipmentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentCreateInput) => equipmentApi.create(input),
    onSuccess: (profile) => {
      qc.setQueryData(equipmentKeys.detail(profile.id), profile);
      void qc.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });
}

/** Mise à jour d'un profil → rafraîchit le détail et les listes. */
export function useUpdateEquipmentProfile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EquipmentUpdateInput) => equipmentApi.update(id, input),
    onSuccess: (profile: EquipmentProfile) => {
      qc.setQueryData(equipmentKeys.detail(id), profile);
      void qc.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });
}

/** Désactivation d'un profil (`isActive=false`) → rafraîchit détail et listes. */
export function useDeactivateEquipmentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => equipmentApi.deactivate(id),
    onSuccess: (profile) => {
      qc.setQueryData(equipmentKeys.detail(profile.id), profile);
      void qc.invalidateQueries({ queryKey: equipmentKeys.all });
    },
  });
}
