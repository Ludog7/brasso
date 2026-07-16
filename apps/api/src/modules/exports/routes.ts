import { prisma } from "@brasso/db";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import type { ExportRepository } from "./repository.js";
import { PrismaExportRepository } from "./repository.js";
import { exportRangeQuery } from "./schema.js";
import { ExportService } from "./service.js";

export interface ExportRoutesOptions {
  /** Repository exports injecté (tests) ; sinon adossé à Prisma. */
  repository?: ExportRepository;
}

/** Préfixe UTF-8 (BOM) : Excel (Windows) lit alors correctement les accents. */
const BOM = String.fromCharCode(0xfeff);

/** Envoie un CSV en pièce jointe (téléchargement), UTF-8 avec BOM. */
function sendCsv(reply: FastifyReply, filename: string, csv: string): FastifyReply {
  return reply
    .type("text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .send(BOM + csv);
}

/**
 * Module `exports` (M7-07) — exports CSV comptables (ventes / cotisations /
 * mouvements). RBAC `transactions:read` (données financières agrégées :
 * caisse/brasseur/admin). **Read-only** (ADR-09) : aucun de ces endpoints n'écrit.
 * La sérialisation réutilise les row-shapers purs de {{M7-01}}.
 */
export const exportsRoutes: FastifyPluginAsync<ExportRoutesOptions> = async (app, opts) => {
  const service = new ExportService(opts.repository ?? new PrismaExportRepository(prisma));

  app.get(
    "/exports/sales.csv",
    { config: app.rbac("transactions", "read") },
    async (req, reply) => {
      const query = exportRangeQuery.parse(req.query);
      return sendCsv(reply, "sales.csv", await service.salesCsv(query));
    },
  );

  app.get(
    "/exports/contributions.csv",
    { config: app.rbac("transactions", "read") },
    async (req, reply) => {
      const query = exportRangeQuery.parse(req.query);
      return sendCsv(reply, "contributions.csv", await service.contributionsCsv(query));
    },
  );

  app.get(
    "/exports/movements.csv",
    { config: app.rbac("transactions", "read") },
    async (req, reply) => {
      const query = exportRangeQuery.parse(req.query);
      return sendCsv(reply, "movements.csv", await service.movementsCsv(query));
    },
  );
};
