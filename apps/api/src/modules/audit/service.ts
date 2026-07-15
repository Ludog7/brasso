/**
 * Service du journal d'audit (M6-03). Fine couche au-dessus du repository :
 * `record` (helper d'écriture append-only réutilisé par les modules membres/RGPD/
 * rapprochement) et `list` (consultation filtrée/paginée pour `GET /audit`).
 */

import type {
  AuditEntryRecord,
  AuditInsert,
  AuditListFilters,
  AuditListResult,
  AuditRepository,
} from "./repository.js";

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  /** Enregistre une action sensible (append-only). Renvoie l'entrée créée. */
  record(entry: AuditInsert): Promise<AuditEntryRecord> {
    return this.repo.record(entry);
  }

  /** Liste les entrées d'audit, `createdAt` desc, filtrées et paginées. */
  list(filters: AuditListFilters): Promise<AuditListResult> {
    return this.repo.list(filters);
  }
}
