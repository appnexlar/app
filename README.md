# Nexlar: Especificação de MVP

CRM imobiliário enxuto para corretores organizarem leads que chegam por WhatsApp e redes sociais, conduzindo cada cliente até a próxima ação certa: origem, qualificação, follow-up, documentação, simulação, visita, negociação e reativação.

Este repositório contém a especificação completa do MVP (core), escrita para ser executada pelo Claude Code. A ordem de leitura recomendada é a numeração dos arquivos em `docs/`.

## Índice

| Documento | O que contém |
|---|---|
| [`docs/01-visao-e-stack.md`](docs/01-visao-e-stack.md) | Visão do produto, personas, princípios, stack recomendada e arquitetura |
| [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md) | Entidades, campos, relações, funil e status |
| [`docs/03-jornadas.md`](docs/03-jornadas.md) | Jornadas do corretor passo a passo, com estados, exceções e critérios de aceite |
| [`docs/04-requisitos.md`](docs/04-requisitos.md) | Requisitos funcionais por módulo, requisitos não-funcionais, LGPD e fora de escopo |
| [`docs/05-guia-claude-code.md`](docs/05-guia-claude-code.md) | Ordem de construção, estrutura de pastas e critérios de pronto |
| [`docs/06-arquitetura-tecnica.md`](docs/06-arquitetura-tecnica.md) | Arquitetura oficial do produto: front, back, banco, storage, deploy e operação |
| [`CLAUDE.md`](CLAUDE.md) | Instruções operacionais para o agente que vai construir |

## Onde o Nexlar roda

| Peça | Onde | Configuração |
|---|---|---|
| API (NestJS) | Railway, região US East | [`railway.json`](railway.json) |
| Front (Vite) | Vercel, site estático | [`vercel.json`](vercel.json) |
| Banco (Postgres 17) | Supabase, região `us-east-1` | `apps/api/.env.production`, fora do git |

O front chama a API pelo caminho relativo `/api`. Em desenvolvimento quem resolve isso é o proxy do Vite; publicado, é o rewrite declarado no `vercel.json`, que encaminha para o Railway. Por isso não existe variável de ambiente com a URL da API no front.

Migration em produção é ato deliberado, nunca efeito colateral de deploy. O comando de start do Railway só sobe a API.

## Escopo desta versão

Core do MVP (Fase 1): cadastro/login do corretor, CRM de leads, funil de atendimento, ficha do lead, follow-up e próximas ações, documentos por etapa, visitas e imóveis apresentados, registro de simulação bancária e dashboard de métricas.

Fora do MVP (fases seguintes): validação de CRECI, página pública do corretor, formulário público de captação, gestão de parceiros, multiusuário/imobiliária e integrações automáticas com bancos. Detalhes em `docs/04-requisitos.md`.
