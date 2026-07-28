-- Código curto e legível para lead e seleção, no mesmo padrão que o imóvel já
-- usa. É o que passa a aparecer na URL (/leads/1042/selecoes/7) no lugar do
-- uuid. O id continua sendo a chave primária: o código é só o apelido público
-- para o corretor, e a autorização segue sendo feita por broker_id.
--
-- SERIAL numera as linhas que já existem na ordem física da tabela, então
-- nenhum registro fica sem código.

ALTER TABLE "lead" ADD COLUMN "code" SERIAL NOT NULL;
CREATE UNIQUE INDEX "lead_code_key" ON "lead"("code");

ALTER TABLE "property_selection" ADD COLUMN "code" SERIAL NOT NULL;
CREATE UNIQUE INDEX "property_selection_code_key" ON "property_selection"("code");
