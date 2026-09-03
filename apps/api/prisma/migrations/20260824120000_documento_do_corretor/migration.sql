-- Documento do corretor (CPF ou CNPJ), guardado e único.
--
-- Até aqui o cadastro pedia o documento, conferia os dígitos na tela e jogava
-- fora: a coluna não existia. Ou seja, não havia como impedir que a mesma
-- pessoa abrisse duas contas, porque o dado nem chegava ao banco.
--
-- Fica opcional: as contas criadas antes desta coluna não têm documento, e
-- exigir agora as trancaria para fora do próprio sistema. O cadastro novo,
-- esse sim, exige. No Postgres, valores nulos não disputam índice único, então
-- as contas antigas convivem sem conflito.

-- CreateEnum
CREATE TYPE "person_type" AS ENUM ('cpf', 'cnpj');

-- AlterTable
ALTER TABLE "broker" ADD COLUMN "person_type" "person_type",
                     ADD COLUMN "document" TEXT;

-- CreateIndex: é esta linha que impede o documento repetido.
CREATE UNIQUE INDEX "broker_document_key" ON "broker"("document");
