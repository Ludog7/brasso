/**
 * Sérialisation CSV **pure et déterministe** pour la comptabilité associée
 * (§Comptabilité : ventes, cotisations, mouvements/dépenses ; export M7-07).
 *
 * `toCsv` échappe selon RFC 4180 (guillemets, virgules, retours ligne), séparateur
 * `,`, fin de ligne `\r\n`. Les montants passent par `units.ts` (`formatCentsToEuros`) :
 * **aucune** conversion monétaire hors `units.ts` (CLAUDE.md). ADR-03 (core pur).
 */

import type { StockMovementReason } from "../schemas/enums.js";
import { formatCentsToEuros } from "../units.js";

/** Colonne CSV : clé de lecture dans la ligne + en-tête affiché. */
export interface CsvColumn {
  key: string;
  header: string;
}

/** Une ligne CSV : valeurs déjà formatées (chaînes), indexées par clé de colonne. */
export type CsvRow = Record<string, string>;

/** Séparateur d'enregistrements RFC 4180. */
const CRLF = "\r\n";

/**
 * Échappe un champ selon RFC 4180 : entouré de guillemets s'il contient `"`, `,`,
 * CR ou LF ; les guillemets internes sont doublés.
 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Sérialise des lignes en CSV RFC 4180. En-tête depuis `columns` (dans l'ordre),
 * puis une ligne par enregistrement ; une clé absente d'une ligne rend un champ vide.
 * Déterministe (aucune horloge, aucune locale). Sans `\r\n` final.
 */
export function toCsv(rows: readonly CsvRow[], columns: readonly CsvColumn[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvField(row[c.key] ?? "")).join(","),
  );
  return [headerLine, ...dataLines].join(CRLF);
}

// ─────────────────────────────────────────────────────────────────────────────
// Row-shapers — domaine → CsvRow (montants en euros, dates ISO)
// ─────────────────────────────────────────────────────────────────────────────

/** Colonnes de l'export des ventes. */
export const SALE_CSV_COLUMNS: readonly CsvColumn[] = [
  { key: "date", header: "date" },
  { key: "montant", header: "montant_eur" },
  { key: "devise", header: "devise" },
  { key: "moyenPaiement", header: "moyen_paiement" },
  { key: "produit", header: "produit" },
  { key: "reference", header: "reference_externe" },
];

/** Vente à exporter (issue d'`ExternalTransaction` normalisée). */
export interface SaleCsvInput {
  occurredAt: Date;
  amountCents: number;
  currency: string;
  paymentMethod?: string | null;
  itemLabel?: string | null;
  externalId: string;
}

/** Projette une vente en ligne CSV (montant en euros, date ISO). */
export function saleCsvRow(sale: SaleCsvInput): CsvRow {
  return {
    date: sale.occurredAt.toISOString(),
    montant: formatCentsToEuros(sale.amountCents),
    devise: sale.currency,
    moyenPaiement: sale.paymentMethod ?? "",
    produit: sale.itemLabel ?? "",
    reference: sale.externalId,
  };
}

/** Colonnes de l'export des cotisations. */
export const CONTRIBUTION_CSV_COLUMNS: readonly CsvColumn[] = [
  { key: "date", header: "date" },
  { key: "montant", header: "montant_eur" },
  { key: "devise", header: "devise" },
  { key: "membre", header: "membre" },
  { key: "reference", header: "reference" },
];

/** Cotisation à exporter (issue d'une transaction rapprochée à un membre). */
export interface ContributionCsvInput {
  occurredAt: Date;
  amountCents: number;
  currency: string;
  memberLabel?: string | null;
  reference?: string | null;
}

/** Projette une cotisation en ligne CSV. */
export function contributionCsvRow(contribution: ContributionCsvInput): CsvRow {
  return {
    date: contribution.occurredAt.toISOString(),
    montant: formatCentsToEuros(contribution.amountCents),
    devise: contribution.currency,
    membre: contribution.memberLabel ?? "",
    reference: contribution.reference ?? "",
  };
}

/** Colonnes de l'export des mouvements de stock / dépenses. */
export const MOVEMENT_CSV_COLUMNS: readonly CsvColumn[] = [
  { key: "date", header: "date" },
  { key: "article", header: "article" },
  { key: "quantite", header: "quantite" },
  { key: "motif", header: "motif" },
  { key: "montant", header: "montant_eur" },
  { key: "note", header: "note" },
];

/**
 * Mouvement de stock / dépense à exporter. `delta` en unité interne de l'article
 * (g/L/UNIT) — **pas** un montant. `amountCents` optionnel (dépense associée).
 */
export interface MovementCsvInput {
  occurredAt: Date;
  articleLabel: string;
  delta: number;
  reason: StockMovementReason;
  amountCents?: number | null;
  note?: string | null;
}

/** Projette un mouvement/dépense en ligne CSV (montant en euros si présent). */
export function movementCsvRow(movement: MovementCsvInput): CsvRow {
  return {
    date: movement.occurredAt.toISOString(),
    article: movement.articleLabel,
    quantite: String(movement.delta),
    motif: movement.reason,
    montant:
      movement.amountCents === undefined || movement.amountCents === null
        ? ""
        : formatCentsToEuros(movement.amountCents),
    note: movement.note ?? "",
  };
}
