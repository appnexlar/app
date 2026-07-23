-- CreateEnum
CREATE TYPE "BrokerStatus" AS ENUM ('ativo', 'suspenso');

-- AlterTable
ALTER TABLE "broker" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "status" "BrokerStatus" NOT NULL DEFAULT 'ativo',
ADD COLUMN     "suspended_at" TIMESTAMPTZ(6),
ADD COLUMN     "suspended_reason" TEXT;

-- CreateTable
CREATE TABLE "email_verification_token" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_token_token_hash_key" ON "email_verification_token"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_token_broker_id_idx" ON "email_verification_token"("broker_id");

-- AddForeignKey
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contas que já existiam entram como confirmadas.
-- Sem isto, o gate de e-mail tranca todo mundo para fora no primeiro deploy:
-- ninguém nunca recebeu link de confirmação, porque a funcionalidade não
-- existia. A regra nova vale de agora em diante, não retroage.
UPDATE "broker" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

-- Blindagem do Supabase para a tabela nova, mesma regra da migration
-- 20260722170000: a API HTTP automática do Supabase não pode enxergar nada.
-- Token de confirmação é credencial: quem lê a tabela entra na conta alheia.
ALTER TABLE "email_verification_token" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."email_verification_token" FROM %I', papel);
    END IF;
  END LOOP;
END
$$;
