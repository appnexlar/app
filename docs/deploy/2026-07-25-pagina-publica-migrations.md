# Migrations da Página Pública do Corretor

Roteiro para aplicar em produção (Supabase) as cinco migrations que vieram
com a branch `pagina-publica-corretor`. Quem roda é você, no seu terminal:
o agente não toca no banco de produção.

Faça isto **antes** de fazer o merge para a `main`, ou junto com ele. A API
nova espera as tabelas novas; se o código subir antes do banco, as rotas da
página pública quebram.

## O que vai mudar

| Migration | O que faz | Risco |
|---|---|---|
| `20260724155355_pagina_publica_fundacao` | Cria a tabela `broker_public_page` e o enum de status, com RLS | Nenhum. Tabela nova. |
| `20260724165510_avatar_upload_corretor` | Adiciona `avatar_key` em `broker` | Nenhum. Coluna nova e opcional. |
| `20260724214939_imovel_visibilidade_publica` | Adiciona `public_visibility`, `public_since` e `highlight_order` em `property` | Nenhum. Nasce tudo `privado` aqui. |
| `20260724220000_interesse_e_notificacoes` | Cria `notification` com RLS e adiciona `pagina_publica` ao enum `lead_source` | Nenhum. Tabela e valor de enum novos. |
| `20260725004500_imovel_nasce_publico` | Troca o DEFAULT de `property.public_visibility` para `publico` | **Atenção**, leia abaixo. |

### Sobre a última

Ela muda **só o padrão dos próximos cadastros**. Nenhum imóvel já existente
é alterado: quem está privado continua privado. Confirme depois de rodar,
com a consulta de verificação no fim deste documento.

Além disso, imóvel público só aparece de verdade se passar na elegibilidade
(disponível, com foto, cidade e tipo) **e** o corretor tiver publicado a
página. Ninguém vai para a internet só por causa deste DEFAULT.

## Passo 1: ver o que está pendente, sem aplicar nada

Na pasta `apps/api`, com as variáveis de produção carregadas:

```bash
DATABASE_URL="$PROD_DATABASE_URL" DIRECT_URL="$PROD_DIRECT_URL" pnpm exec prisma migrate status
```

A saída lista as migrations pendentes. Confira se são as cinco da tabela
acima. Se aparecer alguma a mais, pare e me chame: significa que produção
está atrás em outra frente também.

## Passo 2: fazer backup

No painel do Supabase, projeto do Nexlar: **Database → Backups**. Garanta
que existe um backup recente antes de seguir. É rápido e evita conversa
ruim depois.

## Passo 3: aplicar

```bash
DATABASE_URL="$PROD_DATABASE_URL" DIRECT_URL="$PROD_DIRECT_URL" pnpm exec prisma migrate deploy
```

Use as **duas** variáveis. O `DIRECT_URL` precisa ser a conexão direta, não
o pooler: o pooler não aceita os comandos de DDL da migration, e o Prisma
falha no meio dizendo que não há nada pendente.

`migrate deploy` é idempotente: aplica só o que falta e registra em
`_prisma_migrations`. Não rode o SQL na mão pelo editor do Supabase, senão
o Prisma não fica sabendo e vai tentar aplicar tudo de novo depois.

## Passo 4: conferir

```sql
-- 1. As cinco migrations entraram e nenhuma falhou.
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
WHERE migration_name LIKE '2026072%'
ORDER BY migration_name DESC
LIMIT 6;

-- 2. O DEFAULT novo está de pé.
SELECT column_default
FROM information_schema.columns
WHERE table_name = 'property' AND column_name = 'public_visibility';
-- esperado: 'publico'::property_public_visibility

-- 3. NENHUM imóvel existente virou público sozinho.
--    Rode ANTES e DEPOIS da migration: os números têm que bater.
SELECT public_visibility, count(*)
FROM property
GROUP BY public_visibility;

-- 4. As tabelas novas nasceram com RLS ligada.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('broker_public_page', 'notification');
-- esperado: relrowsecurity = true nas duas
```

## Se der errado

Se o `migrate deploy` parar no meio, o Prisma marca a migration como falha e
recusa as seguintes até você resolver. Não force: me mande a mensagem de
erro e o resultado da consulta 1. O caminho normal é

```bash
DATABASE_URL="$PROD_DATABASE_URL" DIRECT_URL="$PROD_DIRECT_URL" pnpm exec prisma migrate resolve --rolled-back NOME_DA_MIGRATION
```

e rodar de novo depois de corrigir a causa.
