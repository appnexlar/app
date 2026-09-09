-- Unificação de lead e cliente, passo 1: a etapa "convertida em cliente"
-- passa a se chamar "fechado".
--
-- Na entidade única todo mundo é cliente desde o cadastro; o que essa etapa
-- sempre marcou foi o negócio fechado. Renomear o valor do enum não reescreve
-- linha nenhuma e é reversível pelo comando inverso:
--   ALTER TYPE "lead_status" RENAME VALUE 'fechado' TO 'convertida_em_cliente';
ALTER TYPE "lead_status" RENAME VALUE 'convertida_em_cliente' TO 'fechado';
