-- ===========================================================================
-- Seleção Personalizada — Fatia 4 (agendamento de visitas)
-- 1) visit_availability: horários em que o corretor aceita visitas.
-- 2) agenda_event.visit_id: o evento de visita aponta o registro de Visit,
--    para cancelamento e remarcação andarem juntos nos dois lugares.
-- ===========================================================================

CREATE TABLE "visit_availability" (
    "id" uuid NOT NULL,
    "broker_id" uuid NOT NULL,
    "windows" JSONB NOT NULL DEFAULT '[]',
    "slot_duration_min" INTEGER NOT NULL DEFAULT 60,
    "min_notice_hours" INTEGER NOT NULL DEFAULT 12,
    "max_advance_days" INTEGER NOT NULL DEFAULT 14,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visit_availability_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "visit_availability" ADD CONSTRAINT "visit_availability_broker_id_fkey"
  FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "visit_availability_broker_id_key" ON "visit_availability"("broker_id");

-- Blindagem: RLS ligado como em toda tabela nova (policies só no Supabase).
ALTER TABLE "visit_availability" ENABLE ROW LEVEL SECURITY;

-- Vínculo evento de agenda -> visita
ALTER TABLE "agenda_event" ADD COLUMN "visit_id" uuid;
ALTER TABLE "agenda_event" ADD CONSTRAINT "agenda_event_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE SET NULL;
CREATE INDEX "agenda_event_visit_id_idx" ON "agenda_event"("visit_id");
