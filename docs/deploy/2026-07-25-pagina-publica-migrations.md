# Migrations da Página Pública do Corretor

Roteiro para aplicar em produção (Supabase) as cinco migrations que vieram
com a branch `pagina-publica-corretor`. Quem roda é você: o agente não
escreve no banco de produção.

Faça isto **antes** de fazer o merge para a `main`, ou junto com ele. A API
nova espera as tabelas novas; se o código subir antes do banco, as rotas da
página pública quebram.

## Estado de produção conferido em 25 jul 2026

Consultado com `migrate status` e leitura das tabelas:

- Pendentes: **exatamente as cinco migrations desta branch**, nada além.
- Conteúdo: **1 corretor, 0 imóveis, 0 leads.**

Ou seja, não existe dado de cliente para ser afetado. Confira de novo antes
de rodar, com o passo 1: se aparecer imóvel, releia a seção de risco.

## O que vai mudar

| Migration | O que faz |
|---|---|
| `20260724155355_pagina_publica_fundacao` | Cria `broker_public_page` e o enum de status, com RLS |
| `20260724165510_avatar_upload_corretor` | Adiciona `avatar_key` em `broker` |
| `20260724214939_imovel_visibilidade_publica` | Adiciona `public_visibility`, `public_since` e `highlight_order` em `property` |
| `20260724220000_interesse_e_notificacoes` | Cria `notification` com RLS e adiciona `pagina_publica` ao enum `lead_source` |
| `20260725004500_imovel_nasce_publico` | Troca o DEFAULT de `property.public_visibility` para `publico` |

### Risco da mudança de visibilidade

As duas últimas parecem perigosas juntas, e não são. A ordem resolve:

1. A coluna nasce com `DEFAULT 'privado'`, então **todo imóvel que já existir
   fica privado**.
2. Só depois o DEFAULT vira `publico`, valendo para os **próximos** cadastros.

Nenhum imóvel existente vai para a internet. Hoje isso é teórico, porque não
há imóvel nenhum em produção. Para pôr a carteira antiga no ar, o corretor
usa o botão "Colocar todos no ar" em Minha Página, Imóveis.

E mesmo um imóvel público só aparece se passar na elegibilidade (disponível,
com foto, cidade e tipo) **e** a página do corretor estiver publicada.

## Passo 1: ver o que está pendente, sem aplicar nada

As credenciais já estão em `apps/api/.env.production`, que o git ignora. Não
precisa colar URL nenhuma. Copie o bloco inteiro:

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate status )
```

Dois detalhes que fazem o comando falhar se você mudar:

- **Tem que ser dentro de `apps/api`.** Na raiz do monorepo o pnpm responde
  `Command "prisma" not found`, porque o Prisma está instalado só na API.
- **Os parênteses importam.** Eles rodam o `source` numa subshell, então as
  credenciais de produção somem quando o comando acaba, em vez de ficarem
  penduradas no seu terminal.

Esperado: as cinco migrations da tabela acima, e nada além.

## Passo 2: backup

No painel do Supabase, projeto do Nexlar: **Database → Backups**. Garanta que
existe um backup recente. É rápido e evita conversa ruim depois.

## Passo 3: aplicar

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate deploy )
```

`migrate deploy` é idempotente: aplica só o que falta e registra em
`_prisma_migrations`. **Não rode o SQL na mão** pelo editor do Supabase: o
Prisma não fica sabendo e vai tentar aplicar tudo de novo depois.

## Passo 4: conferir

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; psql "$DIRECT_URL" \
  -c "SELECT migration_name, finished_at IS NOT NULL AS ok, rolled_back_at FROM _prisma_migrations WHERE migration_name LIKE '202607242%' OR migration_name LIKE '202607250%' ORDER BY migration_name;" \
  -c "SELECT column_default FROM information_schema.columns WHERE table_name='property' AND column_name='public_visibility';" \
  -c "SELECT public_visibility, count(*) FROM property GROUP BY 1;" \
  -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('broker_public_page','notification');" )
```

O que esperar:

1. As cinco migrations com `ok = t` e `rolled_back_at` vazio.
2. `column_default` = `'publico'::property_public_visibility`.
3. A contagem por visibilidade: hoje vazia, e no futuro os imóveis antigos
   têm que continuar `privado`.
4. `relrowsecurity = t` nas duas tabelas novas.

## Se der errado

Se o `migrate deploy` parar no meio, o Prisma marca a migration como falha e
recusa as seguintes até você resolver. Não force nem rode de novo por cima:
me mande a mensagem de erro e a saída da consulta 1. O caminho normal é

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate resolve --rolled-back NOME_DA_MIGRATION )
```

e rodar de novo depois de corrigida a causa.
