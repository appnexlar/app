-- Unificação de lead e cliente, passo 0: cópia de segurança.
--
-- Nada é apagado nem reescrito nesta migration. As três tabelas que os
-- passos seguintes tocam ganham uma cópia com data no nome. Ficam até a
-- Rafaelle confirmar que produção está certa; a remoção é uma migration à
-- parte, depois disso.
CREATE TABLE "lead_backup_20260904" AS TABLE "lead";
CREATE TABLE "conversion_backup_20260904" AS TABLE "conversion";
CREATE TABLE "lead_preference_backup_20260904" AS TABLE "lead_preference";

-- Mesmas travas das demais tabelas: ninguém lê isto pela API pública.
ALTER TABLE "lead_backup_20260904" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversion_backup_20260904" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_preference_backup_20260904" ENABLE ROW LEVEL SECURITY;
