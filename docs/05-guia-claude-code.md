# 05: Guia de construção para o Claude Code

Este documento traduz a especificação em ordem de trabalho, seguindo a arquitetura de `docs/06` (React no front, API NestJS, PostgreSQL, storage S3). A ideia é construir em fatias verticais que já funcionam, não módulo por módulo isolado. Cada marco entrega algo testável de ponta a ponta.

## 5.1 Preparação

1. Montar o monorepo com pnpm workspaces conforme `docs/06`, seção 6.10: `apps/web`, `apps/api`, `packages/shared`.
2. `docker-compose.yml` pra desenvolvimento local: PostgreSQL 16 e MinIO (S3 local). Subir tudo com um comando.
3. `apps/api`: NestJS sobre Fastify, Prisma apontando pro Postgres local, OpenAPI habilitado.
4. `apps/web`: React com Vite e TypeScript, Tailwind, React Router, TanStack Query, React Hook Form + Zod. Cliente HTTP único em `src/api/` com injeção de token e renovação de sessão.
5. `.env.example` versionado nos dois apps; segredos fora do repositório.
6. CI (GitHub Actions): lint, typecheck, testes e build dos dois apps a cada push.

## 5.2 Banco: schema e migrações

Modelar no Prisma as tabelas de `docs/02`, na ordem: `broker`, `lead`, `lead_activity`, `task`, `document`, `property`, `visit`, `visit_property`, `simulation`, com os enums antes das tabelas que os usam. Foreign keys e constraints no banco. Índices citados no modelo. Migrações versionadas com Prisma Migrate, aplicadas por pipeline, nunca na mão.

O isolamento por corretor não usa RLS: é responsabilidade da API. Todo serviço filtra por `broker_id` extraído do JWT (guard global, ver `docs/06`, seção 6.5).

## 5.3 Marcos de entrega (ordem sugerida)

**Marco 1, esqueleto autenticado.** Auth completa na API (registro, login, refresh, logout, recuperação de senha, Argon2id) e no front (telas de entrar/criar conta, sessão persistente, rotas protegidas). Uma tela protegida vazia. Cobre AUTH-01 a AUTH-03 e AUTH-05. Sem isso nada mais faz sentido, porque tudo depende do corretor autenticado e do isolamento por dono.

**Marco 2, lead de ponta a ponta.** Módulo `leads` na API (CRUD, busca, filtros, detecção de duplicado, timeline) e no front o cadastro rápido (J1), a lista com busca e filtros e a ficha do lead com dados e timeline. Cobre LEAD-01 a LEAD-05, LEAD-09 e LEAD-10. Este é o coração; priorize o cadastro rápido e o baixo atrito.

**Marco 3, funil e follow-up.** Kanban (J4) e o motor de tarefas (J3), com os alertas de lead parado e sem follow-up. Regras de Perdido e Reativar (motivo, data, tarefa automática em transação). Cobre LEAD-06 a LEAD-08 e TASK-01 a TASK-06. Aqui o produto começa a resolver a dor real.

**Marco 4, documentos.** Checklist por etapa, fluxo de URL assinada (upload direto ao bucket, confirmação na API, validação de tipo e tamanho) e status por documento (J5). Cobre DOC-01 a DOC-05. Atenção à LGPD e ao acesso por dono; exclusão de lead apaga os objetos do bucket.

**Marco 5, visitas e simulação.** Visitas com imóveis apresentados (J7) e registro de simulação com atalho para a Caixa (J6). Cobre VISIT-01 a VISIT-05 e SIM-01 a SIM-04.

**Marco 6, dashboard.** Módulo de métricas agregadas na API e a tela de dashboard com alertas clicáveis e conversões (J10). Cobre DASH-01 a DASH-07. Vem por último porque consome dados que os marcos anteriores produzem.

Fechamento e reativação (J8 e J9) não são um marco separado. São transições de status e regras que já entram nos marcos 3 e 5.

## 5.4 Estrutura de pastas

A estrutura oficial do monorepo está em `docs/06`, seção 6.10. Dentro de `apps/web/src`, organize por feature (auth, leads, funnel, tasks, documents, visits, simulations, dashboard), cada uma com suas telas, hooks de dados e componentes, mais `components/` compartilhado (botão, campo, chip, estados vazios) e `api/` (cliente HTTP e tipos gerados). Dentro de `apps/api/src`, um módulo NestJS por domínio, como listado em `docs/06`, seção 6.5.

## 5.5 Convenções

Contrato entre front e back gerado do OpenAPI da API; o build acusa divergência. Datas e dinheiro sempre formatados no padrão brasileiro na interface, guardados em ISO/numérico no banco. Toda entrada da API validada por DTO; erros padronizados. `broker_id` sempre do token, nunca do payload. Toda mutação relevante grava a `lead_activity` na mesma transação. Componentes de estado (carregando, vazio, erro) compartilhados e reusados em toda lista.

## 5.6 Definição de pronto (por marco)

Um marco está pronto quando: as telas tratam os quatro estados; os critérios de aceite das jornadas cobertas passam num teste manual roteirizado; os testes de API do módulo passam, incluindo o teste de isolamento com dois corretores confirmando que um não vê o dado do outro; e o fluxo funciona bem no viewport de celular.

## 5.7 Dados de exemplo (seed)

Criar um seed opcional (script Prisma) com um corretor de teste e uns dez leads espalhados pelos status, algumas tarefas (hoje, atrasada, futura), um par de visitas e uma simulação. Isso permite ver o funil e o dashboard populados sem cadastrar tudo à mão, e ajuda a validar as métricas.
