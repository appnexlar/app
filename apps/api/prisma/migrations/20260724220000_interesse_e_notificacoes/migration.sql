-- AlterEnum
ALTER TYPE "lead_source" ADD VALUE 'pagina_publica';

-- CreateTable Notification
CREATE TABLE "notification" (
    "id" uuid NOT NULL,
    "broker_id" uuid NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action_url" TEXT,
    "read_at" TIMESTAMP(3) with time zone,
    "created_at" TIMESTAMP(3) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "notification" ADD CONSTRAINT "notification_broker_id_fkey"
  FOREIGN KEY ("broker_id") REFERENCES "broker"("id") ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "notification_broker_id_created_at_idx" ON "notification"("broker_id", "created_at" DESC);

-- Enable RLS (policies are created in Supabase only)
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
