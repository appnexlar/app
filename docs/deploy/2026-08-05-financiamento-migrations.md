# Migrations da Coleta de Dados de Financiamento

Roteiro para aplicar em produção (Supabase) as duas migrations que vieram com
a épica de coleta de dados para simulação (PR #5), já na `main`. Quem roda é
você: o agente não escreve no banco de produção.

O front e a API novos sobem sem depender do banco: nenhuma tela ou rota antiga
é tocada. Mas o bloco "Simulação de financiamento" na ficha e o link `/f/:token`
só funcionam depois que o banco receber as tabelas. Ordem recomendada: rodar
isto antes de aprovar o deploy da API no Railway.

## Incidente de 5 ago 2026: deploy falha quando o Supabase está pausado

Os dois primeiros deploys da épica falharam, e o Railway mostrou só
`Healthcheck failure`, que não diz nada. O log do deploy contava a verdade:

```
PrismaClientInitializationError: Error querying the database:
FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found
    at async Proxy.onModuleInit (.../prisma/prisma.service.js)
```

A API sobe, mapeia todas as rotas e morre ao conectar no banco, porque o
`onModuleInit` do Prisma chama `$connect`. Sem processo vivo, o healthcheck
falha. **A connection string estava certa; o projeto no Supabase é que não
respondia** (projeto parado costuma ser pausado pela plataforma). Abrir o
painel e usar o projeto o traz de volta; depois disso o deploy passa.

Como reconhecer rápido, na próxima:

```bash
railway deployment list --service nexlar-api        # pega o id do que falhou
railway logs <ID> --deployment --lines 50           # o erro real aparece no fim
```

O container antigo continua servindo com as conexões que já tinha abertas, e o
`/api/health` responde `database: ok` mesmo com o banco fora para conexões
novas. Ou seja: **health verde não prova que um deploy novo vai subir.**

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
