# Migrations da Coleta de Dados de Financiamento

Roteiro para aplicar em produção (Supabase) as duas migrations que vieram com
a épica de coleta de dados para simulação (PR #5), já na `main`. Quem roda é
você: o agente não escreve no banco de produção.

O front e a API novos sobem sem depender do banco: nenhuma tela ou rota antiga
é tocada. Mas o bloco "Simulação de financiamento" na ficha e o link `/f/:token`
só funcionam depois que o banco receber as tabelas. Ordem recomendada: rodar
isto antes de aprovar o deploy da API no Railway.

## Aviso: credenciais locais desatualizadas (5 ago 2026)

Tentei o `migrate status` (só leitura) e o pooler respondeu
`tenant/user postgres.yrazxrizvqfpzmkvmvxs not found`, nos hosts `aws-0` e
`aws-1`. Como a produção está no ar, o Railway tem credenciais válidas; o
`apps/api/.env.production` da sua máquina é que ficou para trás. Antes do
passo 1, atualize `DATABASE_URL` e `DIRECT_URL` nesse arquivo com a connection
string atual do painel do Supabase (Connect → Session pooler para a porta
5432 do `DIRECT_URL`; Transaction pooler para a 6543 do `DATABASE_URL`).

## O que vai mudar

| Migration | O que faz |
|---|---|
| `20260805120000_financiamento_coleta_fundacao` | Cria o enum de status da solicitação; adiciona `financiamento` ao enum `activity_type`; cria `financing_data_request`, `financing_data_draft`, `financing_data_submission` e `financing_access_code`, todas com índices por corretor e RLS ativa |
| `20260805150000_consent_origin` | Adiciona a coluna opcional `origin` em `consent` (null = corretor; `formulario_publico` = o cliente, pelo link) |

Nenhuma linha existente é alterada: são só tabelas novas, um valor novo de
enum e uma coluna nova opcional. A blindagem de 22 jul (revoke com
`ALTER DEFAULT PRIVILEGES`) já cobre as tabelas novas para `anon` e
`authenticated` automaticamente.

## Passo 1: ver o que está pendente, sem aplicar nada

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate status )
```

- **Tem que ser dentro de `apps/api`.** Na raiz do monorepo o pnpm responde
  `Command "prisma" not found`.
- **Os parênteses importam.** As credenciais de produção vivem só na subshell.

Esperado: **exatamente as duas migrations da tabela acima**, nada além. Se
aparecer outra coisa pendente, pare e me chame antes de aplicar.

## Passo 2: backup

No painel do Supabase, projeto do Nexlar: **Database → Backups**. Garanta que
existe um backup recente.

## Passo 3: aplicar

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate deploy )
```

Esperado: as duas migrations aplicadas e `All migrations have been successfully applied`.

## Passo 4: conferir

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate status )
```

Esperado: `Database schema is up to date!`

## Passo 5: aprovar o deploy da API no Railway

Com o banco pronto, aprove o deploy pendente do serviço `nexlar-api` no
Railway (o push na `main` já o deixou aguardando). O front na Vercel sobe
sozinho e não depende de aprovação.

## Depois do deploy, teste rápido

1. Abra a ficha de uma lead: o bloco "Simulação de financiamento" aparece.
2. Gere um link de teste e abra em aba anônima: o portão pede o código.
3. O código chega no e-mail da lead (Resend em produção, não no log).
