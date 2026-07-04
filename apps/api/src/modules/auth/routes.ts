import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { SESSION_COOKIE } from "../../plugins/auth.js";
import { InvalidCredentialsError } from "./service.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Module `auth` : login/logout/me (ADR-10). Cookie de session httpOnly, signé,
 * `secure` en prod, `sameSite=lax`. Login protégé par rate-limit anti-brute-force.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION",
            message: "Requête invalide",
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const { user, token, expiresAt } = await app.authService.login(
          parsed.data.email,
          parsed.data.password,
        );
        reply.setCookie(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: app.config.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          signed: true,
          expires: expiresAt,
        });
        return reply.send({ user });
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          return reply
            .code(401)
            .send({ error: { code: "INVALID_CREDENTIALS", message: "Identifiants invalides" } });
        }
        throw err;
      }
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const signed = request.cookies[SESSION_COOKIE];
    const unsigned = signed ? app.unsignCookie(signed) : null;
    if (unsigned?.valid && unsigned.value) {
      await app.authService.logout(unsigned.value);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, (request) => {
    return { user: request.user };
  });
};
