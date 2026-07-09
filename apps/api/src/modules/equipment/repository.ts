/**
 * Accès aux données des profils d'équipement (M3-03). Interface injectable pour
 * un repository en mémoire dans les tests (hermétiques, sans base) — même approche
 * que `recipes` (M2-01).
 */

import type { Prisma, PrismaClient } from "@brasso/db";

import type { EquipmentCreateBody, EquipmentUpdateBody } from "./schema.js";

/** Vue de sortie d'un profil d'équipement (forme DB-agnostique). */
export interface EquipmentProfileView {
  id: string;
  name: string;
  nominalVolumeL: number;
  deadspaceL: number;
  transferLossL: number;
  evaporationRateLPerHour: number;
  grainAbsorptionLPerKg: number;
  heatingPowerKw: number | null;
  thermalMassKjPerC: number | null;
  waterProfiles: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentListFilters {
  active?: boolean;
}

export interface EquipmentRepository {
  list(filters: EquipmentListFilters): Promise<EquipmentProfileView[]>;
  findById(id: string): Promise<EquipmentProfileView | null>;
  create(data: EquipmentCreateBody): Promise<EquipmentProfileView>;
  update(id: string, data: EquipmentUpdateBody): Promise<EquipmentProfileView>;
}

/** Normalise un `waterProfiles` validé vers l'entrée JSON Prisma (`null`/`undefined` = inchangé). */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value == null ? undefined : (value as Prisma.InputJsonValue);
}

export class PrismaEquipmentRepository implements EquipmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(filters: EquipmentListFilters): Promise<EquipmentProfileView[]> {
    return this.prisma.equipmentProfile.findMany({
      where: filters.active === undefined ? {} : { isActive: filters.active },
      orderBy: { name: "asc" },
    });
  }

  findById(id: string): Promise<EquipmentProfileView | null> {
    return this.prisma.equipmentProfile.findUnique({ where: { id } });
  }

  create(data: EquipmentCreateBody): Promise<EquipmentProfileView> {
    return this.prisma.equipmentProfile.create({
      data: {
        name: data.name,
        nominalVolumeL: data.nominalVolumeL,
        deadspaceL: data.deadspaceL,
        transferLossL: data.transferLossL,
        evaporationRateLPerHour: data.evaporationRateLPerHour,
        grainAbsorptionLPerKg: data.grainAbsorptionLPerKg,
        heatingPowerKw: data.heatingPowerKw ?? null,
        thermalMassKjPerC: data.thermalMassKjPerC ?? null,
        waterProfiles: toJson(data.waterProfiles),
      },
    });
  }

  update(id: string, data: EquipmentUpdateBody): Promise<EquipmentProfileView> {
    return this.prisma.equipmentProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.nominalVolumeL !== undefined ? { nominalVolumeL: data.nominalVolumeL } : {}),
        ...(data.deadspaceL !== undefined ? { deadspaceL: data.deadspaceL } : {}),
        ...(data.transferLossL !== undefined ? { transferLossL: data.transferLossL } : {}),
        ...(data.evaporationRateLPerHour !== undefined
          ? { evaporationRateLPerHour: data.evaporationRateLPerHour }
          : {}),
        ...(data.grainAbsorptionLPerKg !== undefined
          ? { grainAbsorptionLPerKg: data.grainAbsorptionLPerKg }
          : {}),
        ...(data.heatingPowerKw !== undefined ? { heatingPowerKw: data.heatingPowerKw } : {}),
        ...(data.thermalMassKjPerC !== undefined
          ? { thermalMassKjPerC: data.thermalMassKjPerC }
          : {}),
        ...(data.waterProfiles !== undefined ? { waterProfiles: toJson(data.waterProfiles) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }
}
