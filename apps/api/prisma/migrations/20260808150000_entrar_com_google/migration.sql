-- ===========================================================================
-- Entrar com o Google
--
-- Duas mudanças na tabela broker, ambas aditivas:
--
-- 1) password_hash passa a aceitar NULL. Conta criada pelo Google não tem
--    senha, e gravar um hash inventado seria pior: viraria uma credencial de
--    verdade que ninguém conhece e que um ataque de dicionário poderia achar.
--    Nenhuma linha existente é alterada; quem já tem senha continua com ela.
--
-- 2) google_id guarda o `sub` do id_token, único por conta Google. Fica
--    separado do e-mail de propósito: a pessoa pode trocar o endereço no
--    Google, e o vínculo precisa sobreviver a isso.
--
-- O índice é UNIQUE para que duas contas do Nexlar nunca apontem para a mesma
-- conta Google. NULL não colide com NULL no Postgres, então as contas de senha
-- convivem sem problema.
-- ===========================================================================

ALTER TABLE "broker" ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "broker" ADD COLUMN "google_id" TEXT;

CREATE UNIQUE INDEX "broker_google_id_key" ON "broker"("google_id");
