import { prisma } from "@brasso/db";
import cookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import type { AuthRepository } from "../modules/auth/repository.js";
import { PrismaAuthRepository } from "../modules/auth/repository.js";
import type { AuthUser } from "../modules/auth/service.js";
import { AuthService } from "../modules/auth/service.js";

export const SESSION_COOKIE = "brasso_session";

declare module "fastify" {
  interface FastifyInstance {
    authService: AuthService;
    /** preHandler : exige une session valide, sinon répond 401. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export interface AuthPluginOptions {
  /** Repository injecté (tests) ; sinon adossé à Prisma. */
  repository?: AuthRepository;
}

export default fp<AuthPluginOptions>(
  async (app, opts) => {
    // Cookies signés avec le secret de session (intégrité du token transporté).
    await app.register(cookie, { secret: app.config.SESSION_SECRET });

    const repository = opts.repository ?? new PrismaAuthRepository(prisma);
    app.decorate("authService", new AuthService(repository));
    app.decorateRequest("user", null);

    app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
      const signed = request.cookies[SESSION_COOKIE];
      const unsigned = signed ? app.unsignCookie(signed) : null;
      const token = unsigned?.valid ? unsigned.value : null;

      const user = token ? await app.authService.getUserByToken(token) : null;
      if (!user) {
        await reply
          .code(401)
          .send({ error: { code: "UNAUTHENTICATED", message: "Authentification requise" } });
        return;
      }
      request.user = user;
    });
  },
  { name: "auth", dependencies: ["config"] },
);
