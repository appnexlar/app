-- Alinha o enum lead_status às etapas do funil (docs/02 §2.9).
-- Os valores antigos são migrados para a etapa equivalente da nova jornada:
--   aguardando_informacoes                       -> em_atendimento
--   aguardando_documentacao / simulacao_*        -> aguardando_decisao
--   visitou_imovel                               -> visitando_imoveis
--   em_negociacao / proposta_enviada / fechado   -> convertida_em_cliente
--   perdido                                      -> perdida

CREATE TYPE "lead_status_new" AS ENUM (
  'novo',
  'em_atendimento',
  'preferencias_definidas',
  'selecao_em_preparacao',
  'imoveis_enviados',
  'avaliando_imoveis',
  'visita_solicitada',
  'visita_agendada',
  'visitando_imoveis',
  'imovel_prioritario',
  'aguardando_decisao',
  'convertida_em_cliente',
  'perdida',
  'reativar_futuro'
);

ALTER TABLE "lead" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "lead" ALTER COLUMN "status" TYPE "lead_status_new" USING (
  CASE "status"::text
    WHEN 'aguardando_informacoes' THEN 'em_atendimento'
    WHEN 'aguardando_documentacao' THEN 'aguardando_decisao'
    WHEN 'simulacao_pendente' THEN 'aguardando_decisao'
    WHEN 'simulacao_realizada' THEN 'aguardando_decisao'
    WHEN 'visitou_imovel' THEN 'visitando_imoveis'
    WHEN 'em_negociacao' THEN 'convertida_em_cliente'
    WHEN 'proposta_enviada' THEN 'convertida_em_cliente'
    WHEN 'fechado' THEN 'convertida_em_cliente'
    WHEN 'perdido' THEN 'perdida'
    ELSE "status"::text
  END::"lead_status_new"
);

DROP TYPE "lead_status";

ALTER TYPE "lead_status_new" RENAME TO "lead_status";

ALTER TABLE "lead" ALTER COLUMN "status" SET DEFAULT 'novo';
