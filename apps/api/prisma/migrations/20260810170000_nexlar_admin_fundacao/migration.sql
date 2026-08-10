-- Nexlar Admin: fundação (docs/10, Fase 1).
--
-- Universo administrativo separado do corretor: tabela própria, sessão
-- própria, auditoria própria. Nada aqui referencia "broker".
--
-- Integridade da trilha de auditoria:
--   - ator com ON DELETE RESTRICT: administrador com histórico não é
--     apagado, é suspenso; apagar o ator apagaria a autoria da trilha;
--   - alvo (resource_id) sem foreign key: a trilha sobrevive à exclusão
--     do recurso auditado.

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('super_admin', 'admin', 'suporte', 'financeiro');

-- CreateEnum
CREATE TYPE "admin_status" AS ENUM ('ativo', 'suspenso');

-- CreateTable
CREATE TABLE "admin_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "admin_role" NOT NULL,
    "status" "admin_status" NOT NULL DEFAULT 'ativo',
    "mfa_secret" TEXT,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refresh_token" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" "RefreshRevokeReason",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL,
    "actor_admin_id" UUID NOT NULL,
    "actor_role" "admin_role" NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "previous_state" JSONB,
    "new_state" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refresh_token_token_hash_key" ON "admin_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "admin_refresh_token_admin_user_id_idx" ON "admin_refresh_token"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_admin_id_idx" ON "admin_audit_log"("actor_admin_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_resource_type_resource_id_idx" ON "admin_audit_log"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "admin_refresh_token" ADD CONSTRAINT "admin_refresh_token_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Blindagem: mesmas travas da migration 20260722170000. O revoke de
-- privilégio para anon/authenticated já vale por default para tabelas novas;
-- o RLS precisa ser ligado tabela a tabela.
ALTER TABLE "admin_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_refresh_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;
