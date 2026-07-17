/**
 * Schéma Zod du module `exports` (M7-07) : bornes de période d'un export CSV.
 * `from`/`to` optionnels (ISO) ; par défaut le **mois courant** (calculé côté
 * service). Read-only, ADR-09.
 */

import { z } from "zod";

/** Query `?from=&to=` d'un export (dates ISO optionnelles). */
export const exportRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ExportRangeQuery = z.infer<typeof exportRangeQuery>;
