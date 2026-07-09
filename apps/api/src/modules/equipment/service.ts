/**
 * Orchestration des profils d'équipement (M3-03). Suppression **non exposée** : un
 * profil référencé par des batchs doit rester (Prisma `onDelete: SetNull`) → on
 * désactive (`isActive=false`) plutôt que supprimer.
 */

import type {
  EquipmentListFilters,
  EquipmentProfileView,
  EquipmentRepository,
} from "./repository.js";
import type { EquipmentCreateBody, EquipmentUpdateBody } from "./schema.js";

/** Profil d'équipement introuvable → 404 (lu par l'error handler global). */
export class EquipmentNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
  constructor(id: string) {
    super(`Profil d'équipement ${id} introuvable`);
    this.name = "EquipmentNotFoundError";
  }
}

export class EquipmentService {
  constructor(private readonly repo: EquipmentRepository) {}

  list(filters: EquipmentListFilters): Promise<EquipmentProfileView[]> {
    return this.repo.list(filters);
  }

  async get(id: string): Promise<EquipmentProfileView> {
    const profile = await this.repo.findById(id);
    if (!profile) {
      throw new EquipmentNotFoundError(id);
    }
    return profile;
  }

  create(body: EquipmentCreateBody): Promise<EquipmentProfileView> {
    return this.repo.create(body);
  }

  async update(id: string, body: EquipmentUpdateBody): Promise<EquipmentProfileView> {
    await this.get(id); // 404 explicite avant l'écriture
    return this.repo.update(id, body);
  }

  /** Désactive un profil (`isActive=false`) — préserve l'historique des batchs. */
  async deactivate(id: string): Promise<EquipmentProfileView> {
    await this.get(id);
    return this.repo.update(id, { isActive: false });
  }
}
