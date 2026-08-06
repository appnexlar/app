-- =============================================================================
-- Nexlar · Financiamento, script 2 de 2
-- Migration: 20260805150000_consent_origin
--
-- Rode DEPOIS do script 1. Uma coluna nova, opcional, na tabela consent.
-- Null = consentimento registrado pelo corretor (todo o histórico atual);
-- "formulario_publico" = aceito pelo próprio cliente no link /f/:token.
-- =============================================================================

ALTER TABLE "consent" ADD COLUMN "origin" TEXT;

-- Registro no controle do Prisma.
INSERT INTO "_prisma_migrations" (
  "id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count"
) VALUES (
  gen_random_uuid()::text,
  '6344a928ba62356e733541854d8d478c5747efed756df45aa5ac3f3d93c1012b',
  '20260805150000_consent_origin',
  now(),
  now(),
  1
);
