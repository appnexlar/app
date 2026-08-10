-- Gestão de usuários no Nexlar Admin (docs/10, Fase 3).
--
-- 1. O status do corretor ganha os dois valores que faltavam da épica:
--    bloqueado (segurança ou política) e desativado (conta encerrada).
--    Qualquer status diferente de ativo barra a entrada com a mesma
--    mensagem externa; a distinção é administrativa.
--    "Pendente de verificação" segue DERIVADO de email_verified_at nulo,
--    nunca duplicado em enum (decisão D3).
--
-- 2. last_login_at no broker, com backfill honesto: o refresh token mais
--    recente de cada corretor é a melhor testemunha de quando a conta
--    entrou pela última vez. Conta que nunca entrou fica nula ("Nunca").

-- AlterEnum
ALTER TYPE "BrokerStatus" ADD VALUE 'bloqueado';
ALTER TYPE "BrokerStatus" ADD VALUE 'desativado';

-- AlterTable
ALTER TABLE "broker" ADD COLUMN "last_login_at" TIMESTAMPTZ(6);

-- Backfill a partir da última sessão aberta.
UPDATE "broker" b
SET "last_login_at" = t.ultimo
FROM (
  SELECT "broker_id", MAX("created_at") AS ultimo
  FROM "refresh_token"
  GROUP BY "broker_id"
) t
WHERE t."broker_id" = b."id";
