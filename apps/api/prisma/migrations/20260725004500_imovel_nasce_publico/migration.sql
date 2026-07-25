-- Anúncio é para ser visto: o imóvel passa a nascer público, e o corretor tira
-- do ar o que não quiser divulgar. Só muda o padrão para os PRÓXIMOS cadastros.
-- Os imóveis já existentes ficam como estão: ninguém vai para a internet sem
-- pedir. A tela de Imóveis da página mostra quantos estão fora do ar e oferece
-- colocar todos de uma vez.
ALTER TABLE "property" ALTER COLUMN "public_visibility" SET DEFAULT 'publico';
