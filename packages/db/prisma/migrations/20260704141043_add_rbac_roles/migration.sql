-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed des 4 rôles RBAC figés V1 (matrice §3.5). Données de référence : la
-- disponibilité des rôles fait partie du socle (critère démo M0 « rôles
-- fonctionnels »), pas du seed métier (M1-02). Idempotent via ON CONFLICT.
INSERT INTO "Role" ("id", "key", "label", "createdAt") VALUES
  ('role_admin',    'admin',    'Administrateur',  CURRENT_TIMESTAMP),
  ('role_brasseur', 'brasseur', 'Brasseur',        CURRENT_TIMESTAMP),
  ('role_caisse',   'caisse',   'Caisse',          CURRENT_TIMESTAMP),
  ('role_rgpd',     'rgpd',     'Référent RGPD',   CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
