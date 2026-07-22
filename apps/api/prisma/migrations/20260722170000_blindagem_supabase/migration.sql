-- Blindagem do banco para hospedagem no Supabase.
--
-- Por que isso existe: o Supabase publica automaticamente uma API HTTP sobre
-- todas as tabelas do schema "public", acessível com a chave anônima do
-- projeto. Como o Nexlar guarda CPF, renda e documentos, deixar essa porta
-- aberta seria uma falha de LGPD. O Nexlar não usa essa API: quem fala com o
-- banco é só a nossa API, via Prisma, com a credencial do papel dono.
--
-- Duas travas, uma reforçando a outra:
--   1. RLS ligada em toda tabela: sem política cadastrada, ninguém lê nada.
--   2. Privilégios revogados dos papéis "anon" e "authenticated", inclusive
--      para tabelas que ainda vamos criar.
-- O Prisma não é afetado: o papel dono do banco ignora RLS.
--
-- Roda sem erro no Postgres local do docker compose, que não tem esses papéis.

-- 1. RLS em todas as tabelas atuais do schema public.
DO $$
DECLARE
  tabela record;
BEGIN
  FOR tabela IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela.tablename);
  END LOOP;
END
$$;

-- 2. Tirar qualquer privilégio dos papéis públicos do Supabase, hoje e no futuro.
DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', papel);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', papel);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        papel
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        papel
      );
    END IF;
  END LOOP;
END
$$;
