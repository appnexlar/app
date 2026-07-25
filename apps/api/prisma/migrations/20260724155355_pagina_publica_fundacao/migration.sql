-- CreateEnum
CREATE TYPE "public_page_status" AS ENUM ('rascunho', 'incompleta', 'ativa', 'pausada', 'restrita');

-- CreateTable
CREATE TABLE "broker_public_page" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "slug" TEXT,
    "status" "public_page_status" NOT NULL DEFAULT 'rascunho',
    "professional_name" TEXT,
    "headline" TEXT,
    "bio" TEXT,
    "main_city" TEXT,
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focus" "business_focus",
    "property_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "public_whatsapp" TEXT,
    "public_phone" TEXT,
    "public_email" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "service_hours" TEXT,
    "agency_logo_url" TEXT,
    "publication_terms_accepted_at" TIMESTAMPTZ(6),
    "publication_terms_version" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "paused_at" TIMESTAMPTZ(6),
    "restricted_reason" TEXT,
    "restricted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "broker_public_page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broker_public_page_broker_id_key" ON "broker_public_page"("broker_id");

-- CreateIndex
CREATE UNIQUE INDEX "broker_public_page_slug_key" ON "broker_public_page"("slug");

-- CreateIndex
CREATE INDEX "broker_public_page_status_idx" ON "broker_public_page"("status");

-- AddForeignKey
ALTER TABLE "broker_public_page" ADD CONSTRAINT "broker_public_page_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Blindagem Supabase: RLS não é herdado por tabelas novas. Os privilégios de
-- anon/authenticated já nascem revogados pelos default privileges da migration
-- de blindagem, mas o ENABLE precisa ser explícito aqui.
ALTER TABLE "broker_public_page" ENABLE ROW LEVEL SECURITY;
