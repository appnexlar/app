-- CreateEnum
CREATE TYPE "property_purpose" AS ENUM ('venda', 'locacao', 'venda_locacao', 'temporada');

-- CreateEnum
CREATE TYPE "property_category" AS ENUM ('residencial', 'comercial', 'industrial', 'terreno', 'rural', 'empreendimento');

-- CreateEnum
CREATE TYPE "property_status" AS ENUM ('rascunho', 'disponivel', 'temporariamente_indisponivel', 'reservado', 'em_negociacao', 'vendido', 'alugado', 'arquivado');

-- CreateEnum
CREATE TYPE "property_origin" AS ENUM ('captacao_propria', 'proprietario_particular', 'imobiliaria', 'corretor_parceiro', 'construtora', 'indicacao', 'banco_leilao', 'outro');

-- CreateEnum
CREATE TYPE "address_display_mode" AS ENUM ('completo', 'aproximado', 'sem_numero', 'bairro_cidade');

-- CreateEnum
CREATE TYPE "property_contact_role" AS ENUM ('proprietario', 'corretor_captador', 'corretor_parceiro', 'imobiliaria_responsavel', 'construtora', 'administradora_locacao', 'responsavel_chaves', 'contato_agendamento', 'outro');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('foto', 'video', 'planta', 'documento', 'link_externo');

-- CreateEnum
CREATE TYPE "media_origin" AS ENUM ('corretor', 'imobiliaria', 'proprietario', 'parceiro', 'link_externo', 'outro');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('enviando', 'processando', 'pronto', 'falhou', 'removido');

-- CreateEnum
CREATE TYPE "photo_room" AS ENUM ('fachada', 'sala', 'cozinha', 'quarto', 'banheiro', 'area_externa', 'garagem', 'condominio', 'planta', 'vista', 'outro');

-- AlterTable
ALTER TABLE "property" DROP COLUMN "address",
DROP COLUMN "notes",
DROP COLUMN "price",
ADD COLUMN     "accepts_fgts" BOOLEAN,
ADD COLUMN     "accepts_financing" BOOLEAN,
ADD COLUMN     "accepts_trade" BOOLEAN,
ADD COLUMN     "address_display" "address_display_mode" NOT NULL DEFAULT 'completo',
ADD COLUMN     "address_number" TEXT,
ADD COLUMN     "availability_confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availability_confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN     "availability_confirmed_by" TEXT,
ADD COLUMN     "availability_next_review_at" DATE,
ADD COLUMN     "availability_note" TEXT,
ADD COLUMN     "available_from" DATE,
ADD COLUMN     "category" "property_category" NOT NULL,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" SERIAL NOT NULL,
ADD COLUMN     "commission_notes" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "condo_fee" DECIMAL(14,2),
ADD COLUMN     "condo_name" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Brasil',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "external_code" TEXT,
ADD COLUMN     "external_link" TEXT,
ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "furnished" BOOLEAN,
ADD COLUMN     "guarantee_types" TEXT,
ADD COLUMN     "internal_notes" TEXT,
ADD COLUMN     "iptu" DECIMAL(14,2),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "min_term_months" INTEGER,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "origin" "property_origin" NOT NULL,
ADD COLUMN     "origin_details" JSONB,
ADD COLUMN     "other_fees" TEXT,
ADD COLUMN     "price_negotiable" BOOLEAN,
ADD COLUMN     "purpose" "property_purpose" NOT NULL,
ADD COLUMN     "rent_notes" TEXT,
ADD COLUMN     "rent_price" DECIMAL(14,2),
ADD COLUMN     "sale_price" DECIMAL(14,2),
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "property_status" NOT NULL DEFAULT 'rascunho',
ADD COLUMN     "street" TEXT,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "zip" TEXT;

-- CreateTable
CREATE TABLE "property_contact" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "property_contact_role"[],
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "creci" TEXT,
    "agency_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_media" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "kind" "media_kind" NOT NULL,
    "origin" "media_origin" NOT NULL DEFAULT 'corretor',
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "status" "media_status" NOT NULL DEFAULT 'pronto',
    "storage_path" TEXT,
    "external_url" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "caption" TEXT,
    "room" "photo_room",
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_contact_broker_id_idx" ON "property_contact"("broker_id");

-- CreateIndex
CREATE INDEX "property_contact_property_id_idx" ON "property_contact"("property_id");

-- CreateIndex
CREATE INDEX "property_media_broker_id_idx" ON "property_media"("broker_id");

-- CreateIndex
CREATE INDEX "property_media_property_id_idx" ON "property_media"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_code_key" ON "property"("code");

-- CreateIndex
CREATE INDEX "property_broker_id_status_idx" ON "property"("broker_id", "status");

-- CreateIndex
CREATE INDEX "property_broker_id_city_idx" ON "property"("broker_id", "city");

-- CreateIndex
CREATE INDEX "property_external_code_idx" ON "property"("external_code");

-- AddForeignKey
ALTER TABLE "property_contact" ADD CONSTRAINT "property_contact_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

