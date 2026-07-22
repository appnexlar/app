-- CreateEnum
CREATE TYPE "conversion_reason" AS ENUM ('inicio_financiamento', 'solicitacao_documentos', 'analise_cadastral', 'preparacao_proposta', 'negociacao_formal', 'processo_locacao', 'outro');

-- CreateEnum
CREATE TYPE "conversion_next_step" AS ENUM ('coletar_dados', 'solicitar_documentos', 'registrar_simulacao', 'preparar_proposta', 'iniciar_analise_cadastral', 'iniciar_negociacao');

-- CreateEnum
CREATE TYPE "client_purpose" AS ENUM ('compra', 'locacao');

-- AlterEnum
ALTER TYPE "activity_type" ADD VALUE 'conversao';

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "converted_at" TIMESTAMPTZ(6),
ADD COLUMN     "is_client" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "conversion" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "converted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "conversion_reason" NOT NULL,
    "reason_detail" TEXT,
    "next_step" "conversion_next_step" NOT NULL,
    "purpose" "client_purpose" NOT NULL,
    "property_id" UUID,
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "text_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversion_lead_id_key" ON "conversion"("lead_id");

-- CreateIndex
CREATE INDEX "conversion_broker_id_idx" ON "conversion"("broker_id");

-- CreateIndex
CREATE INDEX "consent_broker_id_idx" ON "consent"("broker_id");

-- CreateIndex
CREATE INDEX "consent_lead_id_idx" ON "consent"("lead_id");

-- CreateIndex
CREATE INDEX "audit_log_broker_id_idx" ON "audit_log"("broker_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "lead_is_client_idx" ON "lead"("is_client");

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion" ADD CONSTRAINT "conversion_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
