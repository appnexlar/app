# Migration da Importação de Imóvel por URL

Roteiro para aplicar em produção (Supabase) a migration que veio com a fatia A
da importação por URL, já na `main` (merge `c2a3a2f`). Quem roda é você: o
agente não escreve no banco de produção.

**Conferido em 8 ago 2026 contra a produção:** só existe **uma** migration
pendente. As duas do financiamento (5 ago) já estão aplicadas.

## Ordem importa

O banco vem **antes** do deploy da API. O `PropertyImportService` grava uma
linha em `property_import` a cada tentativa de importação; sem a tabela, a
primeira importação estoura erro 500. O front na Vercel já subiu sozinho e a
tela `/imoveis/importar` já existe, mas ela só chama a API quando o corretor
cola um link e clica em importar.

Enquanto o banco e a API não subirem, o efeito visível é: **"Importar por link"
abre, e ao importar dá erro**. Nenhuma outra tela é afetada.

## O que vai mudar

| Migration | O que faz |
|---|---|
| `20260807120000_importacao_de_imovel_por_url` | Cria o enum `property_import_status` (`concluida`, `duplicada`, `falhou`) e a tabela `property_import`, com FK para `broker` (cascade) e para `property` (set null), dois índices e RLS ativa |

Nenhuma linha existente é alterada e nenhuma coluna é adicionada a tabela
antiga: é uma tabela nova e um enum novo. A blindagem de 22 jul (revoke com
`ALTER DEFAULT PRIVILEGES`) cobre a tabela nova para `anon` e `authenticated`
automaticamente.

Sobre o `ON DELETE SET NULL` do `property_id`: é proposital. Excluir o imóvel
não apaga a trilha da importação, porque a auditoria precisa sobreviver ao
rascunho descartado. O registro guarda só o resultado estruturado da leitura,
nunca o conteúdo da página.

## Passo 1: ver o que está pendente, sem aplicar nada

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate status )
```

- **Tem que ser dentro de `apps/api`.** Na raiz do monorepo o pnpm responde
  `Command "prisma" not found`.
- **Os parênteses importam.** As credenciais de produção vivem só na subshell.

Esperado: **exatamente `20260807120000_importacao_de_imovel_por_url`**, nada
além. Se aparecer outra coisa, pare e me chame antes de aplicar.

## Passo 2: backup

No painel do Supabase, projeto do Nexlar: **Database → Backups**. Garanta que
existe um backup recente.

## Passo 3: aplicar

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate deploy )
```

Esperado: a migration aplicada e `All migrations have been successfully applied`.

## Passo 4: conferir

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && ( set -a; . ./.env.production; set +a; pnpm exec prisma migrate status )
```

Esperado: `Database schema is up to date!`

## Passo 5: aprovar o deploy da API no Railway

Com o banco pronto, aprove o deploy pendente do serviço `nexlar-api` (o push
na `main` já o deixou aguardando). O front na Vercel sobe sozinho.

**Se o deploy falhar com `Healthcheck failure`**, é o incidente de 5 ago: o
Supabase pausa projetos parados e o Prisma morre ao conectar. Abrir o painel do
Supabase e usar o projeto o traz de volta. O log real aparece assim:

```bash
railway deployment list --service nexlar-api
railway logs <ID> --deployment --lines 50
```

Atenção: o container antigo continua servindo e `/api/health` responde
`database: ok` mesmo com o banco fora para conexões novas. **Health verde não
prova que um deploy novo vai subir.**

## Depois do deploy, teste rápido

1. Em `/imoveis`, clique em **Cadastrar imóvel**: aparece a escolha entre
   importar por link e cadastrar manualmente.
2. Cole um anúncio público de imobiliária e importe. Um exemplo que funciona:
   `https://www.mgimob.com.br/imoveis/venda/residencial/fortaleza/rodolfo-teofilo/CA0979`
3. O resumo mostra o que foi encontrado e "Revisar e completar" abre o wizard
   com o rascunho preenchido.
4. Cole o **mesmo link de novo**: tem que avisar o duplicado sem criar nada.

## Uma coisa a observar depois

`property_import` cresce uma linha por tentativa, inclusive as que falham. Com
volume baixo isso é irrelevante e a trilha vale mais que o espaço. Se um dia o
uso crescer, o candidato natural é descartar as linhas `falhou` mais antigas
que alguns meses, mantendo `concluida` e `duplicada`.
