import { createHash, randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";

import type { AuthRepository, AuthUserRecord } from "./repository.js";

/** Durée de vie d'une session (rotation : un nouveau token à chaque login). */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Paramètres Argon2id (proches des recommandations OWASP) : 19 MiB de mémoire,
 * 2 itérations, parallélisme 1. `@node-rs/argon2` utilise Argon2id par défaut
 * (l'enum `Algorithm` est un const enum incompatible avec verbatimModuleSyntax) ;
 * le préfixe `$argon2id$` du hash produit le confirme (vérifié).
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Vue publique d'un utilisateur (jamais le hash). */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Clés de rôles RBAC (matrice §3.5) ; union des droits côté autorisation. */
  roles: string[];
}

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

/** Erreur volontairement indifférenciée : ne révèle pas login vs mot de passe. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Identifiants invalides");
    this.name = "InvalidCredentialsError";
  }
}

export function toPublicUser(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  /** Hash factice pour équilibrer le temps de réponse quand l'email est inconnu. */
  private dummyHash?: string;

  constructor(private readonly repo: AuthRepository) {}

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.repo.findUserByEmail(email.trim().toLowerCase());

    if (!user || !user.isActive) {
      // Anti-énumération : on vérifie tout de même un hash pour un temps constant.
      await this.equalizeTiming(password);
      throw new InvalidCredentialsError();
    }

    const ok = await verify(user.passwordHash, password);
    if (!ok) {
      throw new InvalidCredentialsError();
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.repo.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt });

    return { user: toPublicUser(user), token, expiresAt };
  }

  async getUserByToken(token: string): Promise<AuthUser | null> {
    const session = await this.repo.findSessionByTokenHash(hashToken(token));
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.repo.deleteSession(session.tokenHash);
      return null;
    }
    const user = await this.repo.findUserById(session.userId);
    if (!user || !user.isActive) {
      return null;
    }
    return toPublicUser(user);
  }

  async logout(token: string): Promise<void> {
    await this.repo.deleteSession(hashToken(token));
  }

  private async equalizeTiming(password: string): Promise<void> {
    this.dummyHash ??= await hash("timing-equalization-dummy", ARGON2_OPTIONS);
    try {
      await verify(this.dummyHash, password);
    } catch {
      // ignore : ce chemin ne sert qu'à consommer un temps comparable.
    }
  }
}
