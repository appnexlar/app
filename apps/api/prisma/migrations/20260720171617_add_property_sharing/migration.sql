-- CreateEnum
CREATE TYPE "selection_status" AS ENUM ('criada', 'enviada', 'visualizada', 'revogada', 'expirada');

-- CreateEnum
CREATE TYPE "selection_response" AS ENUM ('nao_visualizado', 'visualizado', 'tenho_interesse', 'talvez', 'sem_interesse', 'quero_visitar');

-- AlterEnum
ALTER TYPE "activity_type" ADD VALUE 'selecao';

-- CreateTable
CREATE TABLE "property_selection" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "public_token" TEXT NOT NULL,
    "status" "selection_status" NOT NULL DEFAULT 'criada',
    "message" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "viewed_at" TIMESTAMPTZ(6),
    "last_access_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "property_selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_item" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "selection_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "response" "selection_response" NOT NULL DEFAULT 'nao_visualizado',
    "responded_at" TIMESTAMPTZ(6),
    "comment" TEXT,
    "visit_requested_at" TIMESTAMPTZ(6),
    "is_priority" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "selection_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_selection_public_token_key" ON "property_selection"("public_token");

-- CreateIndex
CREATE INDEX "property_selection_broker_id_idx" ON "property_selection"("broker_id");

-- CreateIndex
CREATE INDEX "property_selection_lead_id_idx" ON "property_selection"("lead_id");

-- CreateIndex
CREATE INDEX "selection_item_broker_id_idx" ON "selection_item"("broker_id");

-- CreateIndex
CREATE INDEX "selection_item_selection_id_idx" ON "selection_item"("selection_id");

-- CreateIndex
CREATE INDEX "selection_item_property_id_idx" ON "selection_item"("property_id");

-- AddForeignKey
ALTER TABLE "property_selection" ADD CONSTRAINT "property_selection_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_selection" ADD CONSTRAINT "property_selection_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_item" ADD CONSTRAINT "selection_item_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_item" ADD CONSTRAINT "selection_item_selection_id_fkey" FOREIGN KEY ("selection_id") REFERENCES "property_selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_item" ADD CONSTRAINT "selection_item_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
