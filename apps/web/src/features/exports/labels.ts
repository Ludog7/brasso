/**
 * Libellés FR des exports CSV comptables (M7-11). Ordre d'itération stable.
 */

import type { ExportType } from "@/lib/api";

export const EXPORT_TYPES: ExportType[] = ["sales", "contributions", "movements"];

export const EXPORT_TYPE_LABELS: Record<ExportType, string> = {
  sales: "Ventes",
  contributions: "Cotisations",
  movements: "Mouvements de stock",
};
