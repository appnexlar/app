-- CreateEnum
CREATE TYPE "BrokerCreciStatus" AS ENUM ('nao_enviado', 'pendente', 'aprovado', 'recusado');

-- AlterTable
ALTER TABLE "broker" ADD COLUMN     "creci_document_key" TEXT,
ADD COLUMN     "creci_rejection_reason" TEXT,
ADD COLUMN     "creci_reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "creci_status" "BrokerCreciStatus" NOT NULL DEFAULT 'nao_enviado',
ADD COLUMN     "creci_submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "creci_uf" TEXT;
