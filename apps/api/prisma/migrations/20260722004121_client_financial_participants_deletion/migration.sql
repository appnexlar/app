-- CreateEnum
CREATE TYPE "income_type" AS ENUM ('assalariado', 'autonomo', 'empresario', 'aposentado', 'profissional_liberal', 'outro');

-- CreateEnum
CREATE TYPE "participant_relation" AS ENUM ('conjuge', 'comprador_conjunto', 'locatario_conjunto', 'fiador', 'dependente', 'procurador', 'outro');

-- CreateEnum
CREATE TYPE "deletion_status" AS ENUM ('solicitada', 'em_analise', 'concluida', 'negada');

-- CreateTable
CREATE TABLE "client_financial" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "income_type" "income_type",
    "monthly_income" DECIMAL(14,2),
    "occupation" TEXT,
    "activity_time" TEXT,
    "down_payment" DECIMAL(14,2),
    "has_fgts" BOOLEAN,
    "preferred_bank" TEXT,
    "has_income_composition" BOOLEAN,
    "dependents_count" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_financial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_participant" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "relation" "participant_relation" NOT NULL,
    "full_name" TEXT NOT NULL,
    "cpf" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_deletion_request" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "status" "deletion_status" NOT NULL DEFAULT 'solicitada',
    "reason" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_deletion_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_financial_lead_id_key" ON "client_financial"("lead_id");

-- CreateIndex
CREATE INDEX "client_financial_broker_id_idx" ON "client_financial"("broker_id");

-- CreateIndex
CREATE INDEX "client_participant_broker_id_idx" ON "client_participant"("broker_id");

-- CreateIndex
CREATE INDEX "client_participant_lead_id_idx" ON "client_participant"("lead_id");

-- CreateIndex
CREATE INDEX "data_deletion_request_broker_id_idx" ON "data_deletion_request"("broker_id");

-- CreateIndex
CREATE INDEX "data_deletion_request_lead_id_idx" ON "data_deletion_request"("lead_id");

-- AddForeignKey
ALTER TABLE "client_financial" ADD CONSTRAINT "client_financial_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_financial" ADD CONSTRAINT "client_financial_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_participant" ADD CONSTRAINT "client_participant_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_participant" ADD CONSTRAINT "client_participant_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_request" ADD CONSTRAINT "data_deletion_request_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_request" ADD CONSTRAINT "data_deletion_request_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
