-- ===========================================================================
-- Importação de imóvel por URL — Fatia A (docs/10)
-- property_import: auditoria de cada importação. De onde veio (url, domínio),
-- o que a leitura encontrou (payload estruturado, nunca a página inteira),
-- o resumo mostrado ao corretor e qual rascunho nasceu. Excluir o imóvel não
-- apaga a trilha: property_id vira nulo e o registro fica.
-- ===========================================================================

CREATE TYPE "property_import_status" AS ENUM ('concluida', 'duplicada', 'falhou');

CREATE TABLE "property_import" (
    "id" uuid NOT NULL,
    "broker_id" uuid NOT NULL,
    "url" TEXT NOT NULL,
    "final_url" TEXT,
    "domain" TEXT NOT NULL,
    "status" "property_import_status" NOT NULL,
    "http_status" INTEGER,
    "payload" JSONB,
    "summary" JSONB,
    "error" TEXT,
    "property_id" uuid,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_import_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "property_import" ADD CONSTRAINT "property_import_broker_id_fkey"
  FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "property_import" ADD CONSTRAINT "property_import_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "property_import_broker_id_created_at_idx" ON "property_import"("broker_id", "created_at");
CREATE INDEX "property_import_property_id_idx" ON "property_import"("property_id");

-- Blindagem: RLS ligado como em toda tabela nova (policies só no Supabase).
ALTER TABLE "property_import" ENABLE ROW LEVEL SECURITY;
