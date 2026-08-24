-- Cadastro de cliente direto na lista, sem passar por lead.
--
-- Quem chega ao Nextlar com carteira já formada não tem lead nenhuma para
-- converter: a pessoa já era cliente antes do sistema existir. Os motivos de
-- conversão existentes pressupõem uma jornada ("início de financiamento",
-- "solicitação de documentos") e nenhum descreve esse caso.
--
-- Só acrescenta um valor ao enum. Nada é alterado nem removido, e as
-- conversões que já existem seguem exatamente como estão.
ALTER TYPE "conversion_reason" ADD VALUE IF NOT EXISTS 'cliente_da_carteira' BEFORE 'inicio_financiamento';
