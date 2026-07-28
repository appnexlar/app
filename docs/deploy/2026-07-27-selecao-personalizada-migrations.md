# Migrations da Seleção Personalizada de Imóveis

Roteiro para aplicar em produção (Supabase) as três migrations que vieram
com a épica Seleção Personalizada, já na `main`. Quem roda é você: o agente
não escreve no banco de produção.

A API nova espera as colunas e tabelas novas; se o código já subiu (Vercel e
Railway com deploy automático no push) antes do banco, as rotas de seleção,
preferência de lead e disponibilidade de visitas quebram até você rodar isto.

## Estado de produção conferido em 27 jul 2026

Consultado com `migrate status` e leitura das tabelas:

- Pendentes: **exatamente as três migrations abaixo**, nada além.
- Conteúdo tocado: **0 leads, 0 seleções, 0 eventos de agenda.**

Ou seja, não existe dado de cliente para ser afetado. Confira de novo antes
de rodar, com o passo 1: se aparecer alguma seleção, releia a seção de risco.

## O que vai mudar

| Migration | O que faz |
|---|---|
| `20260725120000_selecao_personalizada_fundacao` | Remapeia o enum de status da seleção (`criada→rascunho`, `enviada/visualizada→ativa`); adiciona `expires_in_days`, `activated_at`, `archived_at`; adiciona `highlight`, `broker_note`, `origin`, `compatibility`, `response_reason` em `selection_item`; cria `lead_preference` com RLS |
| `20260726130000_disponibilidade_de_visitas` | Cria `visit_availability` com RLS; adiciona `visit_id` em `agenda_event` |
| `20260726180000_codigo_curto_de_lead_e_selecao` | Adiciona `code` (SERIAL, único) em `lead` e em `property_selection` |

### Risco do remapeamento de status

A primeira migration troca o tipo do enum de status da seleção com um `CASE`
que converte os valores antigos (`criada`, `enviada`, `visualizada`) para os
novos (`rascunho`, `ativa`). Como hoje não há nenhuma seleção em produção,
essa conversão não tem linha nenhuma para tocar. Se um dia isso rodar com
seleções existentes, o dado é preservado, só o rótulo muda.

## Passo 1: ver o que está pendente, sem aplicar nada

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate status )
```

- **Tem que ser dentro de `apps/api`.** Na raiz do monorepo o pnpm responde
  `Command "prisma" not found`, porque o Prisma está instalado só na API.
- **Os parênteses importam.** Rodam o `source` numa subshell, então as
  credenciais de produção somem quando o comando acaba.

Esperado: as três migrations da tabela acima, e nada além.

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
  -c "SELECT migration_name, finished_at IS NOT NULL AS ok, rolled_back_at FROM _prisma_migrations WHERE migration_name LIKE '202607251%' OR migration_name LIKE '202607261%' OR migration_name LIKE '202607262%' ORDER BY migration_name;" \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='lead' AND column_name='code';" \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='property_selection' AND column_name='code';" \
  -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('lead_preference','visit_availability');" )
```

O que esperar:

1. As três migrations com `ok = t` e `rolled_back_at` vazio.
2. As duas consultas de `code` devolvem a coluna (uma linha cada).
3. `relrowsecurity = t` nas duas tabelas novas.

## Se der errado

Se o `migrate deploy` parar no meio, o Prisma marca a migration como falha e
recusa as seguintes até você resolver. Não force nem rode de novo por cima:
me mande a mensagem de erro e a saída da consulta do passo 1. O caminho
normal é

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate resolve --rolled-back NOME_DA_MIGRATION )
```

e rodar de novo depois de corrigida a causa.
