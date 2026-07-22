-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('instagram', 'tiktok', 'whatsapp', 'indicacao', 'site', 'outro');

-- CreateEnum
CREATE TYPE "lead_intent" AS ENUM ('comprar', 'financiar', 'investir', 'vender', 'pesquisar');

-- CreateEnum
CREATE TYPE "lead_audience" AS ENUM ('brasil', 'exterior');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('novo', 'em_atendimento', 'aguardando_informacoes', 'aguardando_documentacao', 'simulacao_pendente', 'simulacao_realizada', 'visita_agendada', 'visitou_imovel', 'em_negociacao', 'proposta_enviada', 'fechado', 'perdido', 'reativar_futuro');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('nota', 'mudanca_status', 'contato', 'tarefa_criada', 'tarefa_concluida', 'visita', 'documento', 'simulacao');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('comprovante_endereco', 'contracheque', 'ir', 'doc_dependente', 'doc_subsidio', 'doc_exterior', 'contrato', 'outro');

-- CreateEnum
CREATE TYPE "document_stage" AS ENUM ('etapa_1_registro', 'etapa_2_analise');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('pendente', 'recebido', 'validado', 'recusado');

-- CreateEnum
CREATE TYPE "visit_status" AS ENUM ('agendada', 'realizada', 'cancelada', 'remarcada');

-- CreateEnum
CREATE TYPE "simulation_status" AS ENUM ('pendente', 'realizada');

-- CreateTable
CREATE TABLE "broker" (
    "id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "creci" TEXT,
    "agency_name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "cpf" TEXT,
    "source" "lead_source",
    "intent" "lead_intent",
    "audience" "lead_audience",
    "region" TEXT,
    "budget_min" DECIMAL(14,2),
    "budget_max" DECIMAL(14,2),
    "status" "lead_status" NOT NULL DEFAULT 'novo',
    "notes" TEXT,
    "last_contact_at" TIMESTAMPTZ(6),
    "next_action_at" TIMESTAMPTZ(6),
    "lost_reason" TEXT,
    "reactivate_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activity" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" "activity_type" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "doc_type" "document_type" NOT NULL,
    "stage" "document_stage" NOT NULL,
    "file_path" TEXT,
    "file_name" TEXT,
    "status" "document_status" NOT NULL DEFAULT 'pendente',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "price" DECIMAL(14,2),
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "visit_status" NOT NULL DEFAULT 'agendada',
    "feedback" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_property" (
    "visit_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,

    CONSTRAINT "visit_property_pkey" PRIMARY KEY ("visit_id","property_id")
);

-- CreateTable
CREATE TABLE "simulation" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "bank" TEXT NOT NULL DEFAULT 'Caixa',
    "property_value" DECIMAL(14,2),
    "down_payment" DECIMAL(14,2),
    "financed_amount" DECIMAL(14,2),
    "term_months" INTEGER,
    "monthly_installment" DECIMAL(14,2),
    "subsidy" DECIMAL(14,2),
    "status" "simulation_status" NOT NULL DEFAULT 'pendente',
    "result_notes" TEXT,
    "simulated_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "simulation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broker_email_key" ON "broker"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_broker_id_idx" ON "refresh_token"("broker_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_token_broker_id_idx" ON "password_reset_token"("broker_id");

-- CreateIndex
CREATE INDEX "lead_broker_id_idx" ON "lead"("broker_id");

-- CreateIndex
CREATE INDEX "lead_status_idx" ON "lead"("status");

-- CreateIndex
CREATE INDEX "lead_next_action_at_idx" ON "lead"("next_action_at");

-- CreateIndex
CREATE INDEX "lead_last_contact_at_idx" ON "lead"("last_contact_at");

-- CreateIndex
CREATE INDEX "lead_activity_broker_id_idx" ON "lead_activity"("broker_id");

-- CreateIndex
CREATE INDEX "lead_activity_lead_id_idx" ON "lead_activity"("lead_id");

-- CreateIndex
CREATE INDEX "task_broker_id_idx" ON "task"("broker_id");

-- CreateIndex
CREATE INDEX "task_lead_id_idx" ON "task"("lead_id");

-- CreateIndex
CREATE INDEX "task_due_at_idx" ON "task"("due_at");

-- CreateIndex
CREATE INDEX "document_broker_id_idx" ON "document"("broker_id");

-- CreateIndex
CREATE INDEX "document_lead_id_idx" ON "document"("lead_id");

-- CreateIndex
CREATE INDEX "property_broker_id_idx" ON "property"("broker_id");

-- CreateIndex
CREATE INDEX "visit_broker_id_idx" ON "visit"("broker_id");

-- CreateIndex
CREATE INDEX "visit_lead_id_idx" ON "visit"("lead_id");

-- CreateIndex
CREATE INDEX "visit_property_property_id_idx" ON "visit_property"("property_id");

-- CreateIndex
CREATE INDEX "simulation_broker_id_idx" ON "simulation"("broker_id");

-- CreateIndex
CREATE INDEX "simulation_lead_id_idx" ON "simulation"("lead_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activity" ADD CONSTRAINT "lead_activity_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property" ADD CONSTRAINT "property_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_property" ADD CONSTRAINT "visit_property_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_property" ADD CONSTRAINT "visit_property_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation" ADD CONSTRAINT "simulation_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation" ADD CONSTRAINT "simulation_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
