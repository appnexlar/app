-- ===========================================================================
-- Seleção Personalizada de Imóveis — Fatia 1 (fundação)
-- ---------------------------------------------------------------------------
-- 1) O ciclo de vida da seleção ganha rascunho, ativação e arquivamento.
--    "visualizada" deixa de ser estado do link (já vive em viewed_at):
--    criada       -> rascunho
--    enviada      -> ativa
--    visualizada  -> ativa
-- 2) selection_item ganha destaque, observação do corretor, origem,
--    compatibilidade, motivo da recusa e unicidade por seleção.
-- 3) Nova tabela lead_preference (preferências estruturadas da lead).
-- ===========================================================================

-- 1) Remapear o enum de status. Postgres não remove valor de enum: cria-se o
--    tipo novo, converte-se a coluna com CASE e descarta-se o antigo.
CREATE TYPE "selection_status_new" AS ENUM ('rascunho', 'ativa', 'expirada', 'revogada', 'arquivada');

ALTER TABLE "property_selection" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "property_selection" ALTER COLUMN "status" TYPE "selection_status_new"
  USING (
    CASE "status"::text
      WHEN 'criada' THEN 'rascunho'
      WHEN 'enviada' THEN 'ativa'
      WHEN 'visualizada' THEN 'ativa'
      ELSE "status"::text
    END
  )::"selection_status_new";

DROP TYPE "selection_status";
ALTER TYPE "selection_status_new" RENAME TO "selection_status";
ALTER TABLE "property_selection" ALTER COLUMN "status" SET DEFAULT 'rascunho';

-- Novas colunas da seleção
ALTER TABLE "property_selection"
  ADD COLUMN "expires_in_days" INTEGER,
  ADD COLUMN "activated_at" TIMESTAMPTZ(6),
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

-- Seleções antigas (envio rápido) já nasciam enviadas: a ativação delas é o
-- próprio envio.
UPDATE "property_selection" SET "activated_at" = "sent_at" WHERE "status" = 'ativa';

-- 2) Itens da seleção
CREATE TYPE "selection_item_origin" AS ENUM ('preferencia', 'manual');
CREATE TYPE "selection_compatibility" AS ENUM ('alta', 'media', 'baixa', 'fora_do_perfil');

ALTER TABLE "selection_item"
  ADD COLUMN "highlight" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "broker_note" TEXT,
  ADD COLUMN "origin" "selection_item_origin" NOT NULL DEFAULT 'manual',
  ADD COLUMN "compatibility" "selection_compatibility",
  ADD COLUMN "response_reason" TEXT;

-- Um imóvel não aparece duas vezes na mesma seleção. O fluxo antigo criava
-- uma seleção nova por envio (um item cada), então não há duplicata a limpar.
CREATE UNIQUE INDEX "selection_item_selection_id_property_id_key"
  ON "selection_item"("selection_id", "property_id");

-- 3) Preferências estruturadas da lead (no máximo uma por lead)
CREATE TABLE "lead_preference" (
    "id" uuid NOT NULL,
    "broker_id" uuid NOT NULL,
    "lead_id" uuid NOT NULL,
    "purpose" "property_purpose",
    "types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "neighborhoods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "price_min" DECIMAL(14,2),
    "price_max" DECIMAL(14,2),
    "bedrooms_min" INTEGER,
    "bathrooms_min" INTEGER,
    "parking_min" INTEGER,
    "area_min" INTEGER,
    "area_max" INTEGER,
    "furnished" BOOLEAN,
    "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "restrictions" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_preference_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lead_preference" ADD CONSTRAINT "lead_preference_broker_id_fkey"
  FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE;
ALTER TABLE "lead_preference" ADD CONSTRAINT "lead_preference_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "lead_preference_lead_id_key" ON "lead_preference"("lead_id");
CREATE INDEX "lead_preference_broker_id_idx" ON "lead_preference"("broker_id");

-- Blindagem: RLS ligado como em toda tabela nova (policies só no Supabase).
ALTER TABLE "lead_preference" ENABLE ROW LEVEL SECURITY;
