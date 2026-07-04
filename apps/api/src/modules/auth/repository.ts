import type { PrismaClient } from "@brasso/db";

/** Utilisateur tel que lu pour l'authentification (inclut le hash). */
export interface AuthUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
  /** Clés des rôles RBAC affectés (via `UserRole` → `Role.key`). */
  roles: string[];
}

/** Session persistée : on ne stocke que le hash du token, jamais le token brut. */
export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

/**
 * Accès aux données d'auth. L'interface permet d'injecter une implémentation
 * en mémoire dans les tests (hermétiques, sans base) tout en gardant Prisma en
 * production.
 */
export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createSession(session: SessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

/** Colonnes lues pour l'auth + rôles (via jointure `UserRole`). */
const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  isActive: true,
  roles: { select: { role: { select: { key: true } } } },
} as const;

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
  roles: { role: { key: string } }[];
};

/** Aplati la jointure `UserRole` en simple liste de clés de rôles. */
function toRecord(row: UserRow): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    isActive: row.isActive,
    roles: row.roles.map((ur) => ur.role.key),
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email }, select: USER_SELECT });
    return row ? toRecord(row) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    return row ? toRecord(row) : null;
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.prisma.session.create({ data: session });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { tokenHash },
      select: { tokenHash: true, userId: true, expiresAt: true },
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }
}
