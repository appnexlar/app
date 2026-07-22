-- CreateEnum
CREATE TYPE "marital_status" AS ENUM ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo', 'outro');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('a_vista', 'financiamento', 'fgts_mais_financiamento', 'permuta', 'outro');

-- CreateTable
CREATE TABLE "client_profile" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "birth_date" DATE,
    "marital_status" "marital_status",
    "nationality" TEXT,
    "residence_country" TEXT,
    "cep" TEXT,
    "street" TEXT,
    "address_number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "alt_phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_negotiation" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "property_value" DECIMAL(14,2),
    "interest_date" DATE,
    "expected_term" TEXT,
    "payment_method" "payment_method",
    "needs_financing" BOOLEAN,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_profile_lead_id_key" ON "client_profile"("lead_id");

-- CreateIndex
CREATE INDEX "client_profile_broker_id_idx" ON "client_profile"("broker_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_negotiation_lead_id_key" ON "client_negotiation"("lead_id");

-- CreateIndex
CREATE INDEX "client_negotiation_broker_id_idx" ON "client_negotiation"("broker_id");

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_negotiation" ADD CONSTRAINT "client_negotiation_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_negotiation" ADD CONSTRAINT "client_negotiation_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
