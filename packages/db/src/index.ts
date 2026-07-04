/**
 * @brasso/db — client Prisma (singleton) et types générés.
 *
 * Le schéma vit dans `prisma/schema.prisma` ; le client est généré par
 * `prisma generate` (lancé au `postinstall`). Le schéma métier complet et le
 * seed arrivent en M1-01 / M1-02.
 */
import { PrismaClient } from "@prisma/client";

// Réutilise une seule instance en dev (évite l'explosion de connexions lors du
// hot-reload) ; en prod, une instance par process.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { Prisma, Settings } from "@prisma/client";
export { PrismaClient } from "@prisma/client";
