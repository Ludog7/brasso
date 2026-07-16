/**
 * Orchestration du module `alerts` (M7-06) — dashboard des anomalies d'intégration.
 * Lecture (liste/détail avec contexte) et **résolution** (bascule `RESOLVED` +
 * ajustement de stock manuel optionnel, registre M5). Émission d'une anomalie
 * `WEBHOOK_FAILURE` sur échec d'ingestion **post-signature** (branchée sur le
 * pipeline webhook, {{M7-03}}).
 */

import type { AlertListFilters, AlertRecord, AlertRepository } from "./repository.js";
import type { AlertResolveBody } from "./schema.js";

/** Anomalie introuvable → 404. */
export class AlertNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "ALERT_NOT_FOUND";
  constructor(id: string) {
    super(`Anomalie ${id} introuvable`);
    this.name = "AlertNotFoundError";
  }
}

export class AlertService {
  constructor(private readonly repo: AlertRepository) {}

  /** Liste paginée des anomalies (filtres status/type), `createdAt` desc. */
  async list(filters: AlertListFilters): Promise<{ alerts: AlertRecord[]; total: number }> {
    return this.repo.list(filters);
  }

  /** Détail d'une anomalie avec son contexte — 404 si absente. */
  async get(id: string): Promise<AlertRecord> {
    const alert = await this.repo.findById(id);
    if (!alert) {
      throw new AlertNotFoundError(id);
    }
    return alert;
  }

  /**
   * Résout une anomalie : bascule `RESOLVED` (+ ajustement de stock optionnel).
   * 404 si absente ; **no-op** si déjà `RESOLVED` (idempotent, aucun mouvement créé).
   */
  async resolve(id: string, body: AlertResolveBody, userId: string | null): Promise<AlertRecord> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AlertNotFoundError(id);
    }
    if (existing.status === "RESOLVED") {
      return existing; // idempotent : ne recrée pas de mouvement d'ajustement.
    }
    return this.repo.resolve(id, body.stockAdjustment ?? null, userId);
  }

  /**
   * Enregistre un échec d'ingestion **post-signature** (normalisation/persistance)
   * en anomalie `WEBHOOK_FAILURE`. Best-effort : l'appelant (sink webhook) ne doit
   * jamais laisser une erreur ici perturber la réponse au provider.
   */
  async recordWebhookFailure(providerId: string, message: string): Promise<void> {
    await this.repo.createWebhookFailure(providerId, message);
  }
}
