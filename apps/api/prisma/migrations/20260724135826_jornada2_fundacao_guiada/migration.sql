-- CreateEnum
CREATE TYPE "guidance_status" AS ENUM ('available', 'shown', 'dismissed', 'skipped', 'in_progress', 'completed', 'reopened', 'expired');

-- CreateEnum
CREATE TYPE "work_mode" AS ENUM ('sozinho', 'imobiliaria');

-- CreateEnum
CREATE TYPE "business_focus" AS ENUM ('venda', 'locacao', 'ambos');

-- CreateTable
CREATE TABLE "product_event" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "dedupe_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guidance_progress" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "guidance_key" TEXT NOT NULL,
    "status" "guidance_status" NOT NULL DEFAULT 'available',
    "show_count" INTEGER NOT NULL DEFAULT 0,
    "first_shown_at" TIMESTAMPTZ(6),
    "last_shown_at" TIMESTAMPTZ(6),
    "dismissed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "reopened_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guidance_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_profile" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "work_mode" "work_mode",
    "business_focus" "business_focus",
    "has_existing_leads" BOOLEAN,
    "has_existing_properties" BOOLEAN,
    "calendar_provider" TEXT,
    "diagnosis_completed" BOOLEAN NOT NULL DEFAULT false,
    "diagnosis_skipped" BOOLEAN NOT NULL DEFAULT false,
    "first_access_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_event_broker_id_idx" ON "product_event"("broker_id");

-- CreateIndex
CREATE INDEX "product_event_broker_id_type_idx" ON "product_event"("broker_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "product_event_broker_id_dedupe_key_key" ON "product_event"("broker_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "guidance_progress_broker_id_idx" ON "guidance_progress"("broker_id");

-- CreateIndex
CREATE UNIQUE INDEX "guidance_progress_broker_id_guidance_key_key" ON "guidance_progress"("broker_id", "guidance_key");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_profile_broker_id_key" ON "onboarding_profile"("broker_id");

-- AddForeignKey
ALTER TABLE "product_event" ADD CONSTRAINT "product_event_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidance_progress" ADD CONSTRAINT "guidance_progress_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_profile" ADD CONSTRAINT "onboarding_profile_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Blindagem Supabase para as tabelas novas.
--
-- A migration 20260722170000_blindagem_supabase já revoga privilégios de anon
-- e authenticated para tabelas futuras (via ALTER DEFAULT PRIVILEGES), mas o
-- RLS não é herdado: cada tabela nova precisa ligá-lo. Sem política cadastrada,
-- ninguém lê nada por essas tabelas. O Prisma usa o papel dono, que ignora RLS.
-- Roda sem erro no Postgres local, que não tem RLS forçado por padrão.
-- ---------------------------------------------------------------------------
ALTER TABLE "product_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guidance_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_profile" ENABLE ROW LEVEL SECURITY;
