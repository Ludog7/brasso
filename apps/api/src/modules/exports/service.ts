/**
 * Orchestration du module `exports` (M7-07) — sérialise ventes / cotisations /
 * mouvements en CSV comptable via les row-shapers **purs** de {{M7-01}}
 * (`saleCsvRow`/`contributionCsvRow`/`movementCsvRow` + `toCsv`, RFC 4180, montants
 * euros par `units.ts`). La plateforme **pré-structure** pour un outil comptable
 * externe (ADR-09, frontière NF525) : aucun plan de comptes ici.
 */

import {
  CONTRIBUTION_CSV_COLUMNS,
  contributionCsvRow,
  MOVEMENT_CSV_COLUMNS,
  movementCsvRow,
  SALE_CSV_COLUMNS,
  saleCsvRow,
  toCsv,
} from "@brasso/core";

import type { DateRange, ExportRepository } from "./repository.js";
import type { ExportRangeQuery } from "./schema.js";

export class ExportService {
  constructor(private readonly repo: ExportRepository) {}

  /** CSV des ventes (`kind = SALE`) sur la période. */
  async salesCsv(query: ExportRangeQuery): Promise<string> {
    const range = resolveRange(query);
    const rows = (await this.repo.listSales(range)).map((s) =>
      saleCsvRow({
        occurredAt: s.occurredAt,
        amountCents: s.amountCents,
        currency: s.currency,
        paymentMethod: s.paymentMethod,
        itemLabel: s.externalProductId,
        externalId: s.externalId,
      }),
    );
    return toCsv(rows, SALE_CSV_COLUMNS);
  }

  /** CSV des cotisations (`kind = MEMBERSHIP`) sur la période. */
  async contributionsCsv(query: ExportRangeQuery): Promise<string> {
    const range = resolveRange(query);
    const rows = (await this.repo.listContributions(range)).map((c) =>
      contributionCsvRow({
        occurredAt: c.occurredAt,
        amountCents: c.amountCents,
        currency: c.currency,
        memberLabel: c.memberLabel,
        reference: c.externalId,
      }),
    );
    return toCsv(rows, CONTRIBUTION_CSV_COLUMNS);
  }

  /** CSV des mouvements de stock sur la période. */
  async movementsCsv(query: ExportRangeQuery): Promise<string> {
    const range = resolveRange(query);
    const rows = (await this.repo.listMovements(range)).map((m) =>
      movementCsvRow({
        occurredAt: m.occurredAt,
        articleLabel: m.articleLabel,
        delta: m.delta,
        reason: m.reason,
        note: m.note,
      }),
    );
    return toCsv(rows, MOVEMENT_CSV_COLUMNS);
  }
}

/** Résout la période : bornes fournies, sinon **mois courant** (UTC) → maintenant. */
function resolveRange(query: ExportRangeQuery): DateRange {
  const now = new Date();
  const from =
    query.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = query.to ?? now;
  return { from, to };
}
