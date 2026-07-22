-- Agenda: evento unificado do corretor. Migra as tarefas existentes (task)
-- para agenda_event como type = 'tarefa' e remove a tabela task.

-- CreateEnum
CREATE TYPE "agenda_event_type" AS ENUM ('tarefa', 'visita', 'compromisso', 'bloqueio', 'google_ocupado');
CREATE TYPE "agenda_event_source" AS ENUM ('nexlar', 'google');
CREATE TYPE "agenda_sync_status" AS ENUM ('nao_sincronizado', 'pendente', 'sincronizado', 'alterado', 'erro', 'desconectado');
CREATE TYPE "agenda_event_status" AS ENUM ('pendente', 'concluida', 'cancelada', 'agendado', 'solicitada', 'aguardando_confirmacao', 'confirmada', 'realizada', 'remarcada', 'nao_compareceu', 'aguardando_feedback');

-- CreateTable
CREATE TABLE "agenda_event" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "type" "agenda_event_type" NOT NULL,
    "lead_id" UUID,
    "property_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "status" "agenda_event_status" NOT NULL DEFAULT 'agendado',
    "task_kind" TEXT,
    "reminder_minutes" INTEGER,
    "recurrence" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "source" "agenda_event_source" NOT NULL DEFAULT 'nexlar',
    "sync_status" "agenda_sync_status" NOT NULL DEFAULT 'nao_sincronizado',
    "google_calendar_id" TEXT,
    "google_event_id" TEXT,
    "google_updated_at" TIMESTAMPTZ(6),
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agenda_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_event_broker_id_idx" ON "agenda_event"("broker_id");
CREATE INDEX "agenda_event_lead_id_idx" ON "agenda_event"("lead_id");
CREATE INDEX "agenda_event_property_id_idx" ON "agenda_event"("property_id");
CREATE INDEX "agenda_event_broker_id_start_at_idx" ON "agenda_event"("broker_id", "start_at");

-- Migra tarefas existentes para a agenda (type = tarefa)
INSERT INTO "agenda_event" (
    "id", "broker_id", "type", "lead_id", "title", "start_at", "all_day",
    "status", "completed_at", "created_at", "updated_at"
)
SELECT
    "id", "broker_id", 'tarefa'::"agenda_event_type", "lead_id", "title", "due_at", false,
    (CASE WHEN "done" THEN 'concluida' ELSE 'pendente' END)::"agenda_event_status",
    "done_at", "created_at", "updated_at"
FROM "task";

-- AddForeignKey
ALTER TABLE "agenda_event" ADD CONSTRAINT "agenda_event_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agenda_event" ADD CONSTRAINT "agenda_event_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agenda_event" ADD CONSTRAINT "agenda_event_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable (dados já migrados acima)
DROP TABLE "task";
