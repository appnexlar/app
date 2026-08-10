-- Nexlar Admin: entrar com o Google.
--
-- No Admin o Google AUTENTICA, nunca cadastra: o vínculo (google_id) só é
-- gravado no primeiro login de um admin_user que já existe, e e-mail
-- desconhecido é recusado sem criar nada. A senha continua existindo como
-- porta de contingência.

-- AlterTable
ALTER TABLE "admin_user" ADD COLUMN "google_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_google_id_key" ON "admin_user"("google_id");
