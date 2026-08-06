-- Coleta de dados para simulação de financiamento (docs/09, Fatia A).
-- Quatro tabelas novas: a solicitação com ciclo de vida, o rascunho mutável
-- do autosave, a submissão imutável versionada e o código OTP de acesso.

-- CreateEnum
CREATE TYPE "financing_request_status" AS ENUM ('rascunho', 'enviada', 'respondida', 'em_revisao', 'correcao_solicitada', 'aprovada_para_simulacao', 'expirada', 'revogada', 'arquivada');

-- AlterEnum: marco de financiamento na timeline da lead
ALTER TYPE "activity_type" ADD VALUE 'financiamento';

-- CreateTable
CREATE TABLE "financing_data_request" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "property_id" UUID,
    "code" SERIAL NOT NULL,
    "status" "financing_request_status" NOT NULL DEFAULT 'rascunho',
    "token_hash" TEXT,
    "requested_sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "expires_in_days" INTEGER,
    "expires_at" TIMESTAMPTZ(6),
    "first_opened_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "consent_version" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financing_data_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_data_draft" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "completed_sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financing_data_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_data_submission" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "consent_id" UUID,
    "correction_note" TEXT,
    "correction_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_data_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_access_code" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_access_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financing_data_request_code_key" ON "financing_data_request"("code");

-- CreateIndex
CREATE UNIQUE INDEX "financing_data_request_token_hash_key" ON "financing_data_request"("token_hash");

-- CreateIndex
CREATE INDEX "financing_data_request_broker_id_idx" ON "financing_data_request"("broker_id");

-- CreateIndex
CREATE INDEX "financing_data_request_lead_id_idx" ON "financing_data_request"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "financing_data_draft_request_id_key" ON "financing_data_draft"("request_id");

-- CreateIndex
CREATE INDEX "financing_data_draft_broker_id_idx" ON "financing_data_draft"("broker_id");

-- CreateIndex
CREATE INDEX "financing_data_submission_broker_id_idx" ON "financing_data_submission"("broker_id");

-- CreateIndex
CREATE UNIQUE INDEX "financing_data_submission_request_id_version_key" ON "financing_data_submission"("request_id", "version");

-- CreateIndex
CREATE INDEX "financing_access_code_request_id_idx" ON "financing_access_code"("request_id");

-- CreateIndex
CREATE INDEX "financing_access_code_broker_id_idx" ON "financing_access_code"("broker_id");

-- AddForeignKey
ALTER TABLE "financing_data_request" ADD CONSTRAINT "financing_data_request_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_data_request" ADD CONSTRAINT "financing_data_request_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_data_request" ADD CONSTRAINT "financing_data_request_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_data_draft" ADD CONSTRAINT "financing_data_draft_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_data_draft" ADD CONSTRAINT "financing_data_draft_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "financing_data_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_data_submission" ADD CONSTRAINT "financing_data_submission_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_data_submission" ADD CONSTRAINT "financing_data_submission_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "financing_data_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_access_code" ADD CONSTRAINT "financing_access_code_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_access_code" ADD CONSTRAINT "financing_access_code_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "financing_data_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Blindagem: a API é o único caminho. Nenhum papel de cliente direto
-- (anon/authenticated do Supabase) enxerga estas tabelas.
ALTER TABLE "financing_data_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financing_data_draft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financing_data_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financing_access_code" ENABLE ROW LEVEL SECURITY;
