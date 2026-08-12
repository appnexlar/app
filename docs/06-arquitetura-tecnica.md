# 06: Arquitetura técnica do produto

Este documento define a arquitetura do Nextlar como produto comercial: o que roda no front, o que roda no back, como o banco é organizado e como tudo é publicado e operado. Ele substitui a abordagem simplificada descrita originalmente em `docs/01` (front falando direto com Supabase). A partir daqui, a arquitetura oficial é a deste documento.

## 6.1 Por que mudou

A primeira versão da spec propunha o front conversando direto com o Supabase, sem servidor próprio. Isso é ótimo pra validar rápido, mas o Nextlar vai ser vendido como produto. Produto vendido precisa de coisas que a abordagem sem backend dificulta: regras de negócio centralizadas (e não espalhadas no cliente), controle fino de acesso e auditoria, cobrança e planos no futuro, integrações (WhatsApp, bancos, parceiros) e liberdade pra trocar qualquer fornecedor sem reescrever o app. Com backend próprio, o front vira um consumidor de API e toda a inteligência fica num lugar só, versionada e testável.

## 6.2 Decisão resumida

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | SPA rápida, mobile-first, ecossistema maduro |
| Backend | Node.js + TypeScript com NestJS | Uma linguagem só no projeto inteiro; framework estruturado, feito pra equipes e produtos |
| ORM / migrações | Prisma | Migrações versionadas, tipos gerados do schema, produtividade alta |
| Banco | PostgreSQL 16 | Escolha da equipe (e a minha): maduro, gratuito, perfeito pra SaaS multi-tenant |
| Autenticação | JWT próprio (access + refresh), senha com Argon2 | Controle total do fluxo, sem dependência de terceiro |
| Storage de mídia e documentos | Bucket privado compatível com S3, servido pela API | Padrão de mercado, portável entre fornecedores; acesso sempre validado pela API (ver 6.8) |
| API | REST com OpenAPI (Swagger) gerado | Contrato claro entre front e back, documentação automática |
| Infra | Docker em tudo; front em CDN, API em container, Postgres gerenciado | Deploy previsível e barato no início, com caminho de crescimento |

## 6.3 Visão geral

```
[ Navegador / celular ]
        |
        v
[ Front: React SPA ]  servido por CDN (Vercel/Cloudflare)
        |
        |  HTTPS / JSON  (REST, JWT no header)
        v
[ API: NestJS (Node + TS) ]  container Docker
   ├─ Auth (JWT, refresh, Argon2)
   ├─ Módulos de domínio (leads, tasks, documents, visits, simulations, dashboard)
   ├─ Validação de entrada (DTOs + class-validator/Zod)
   └─ Prisma (ORM)
        |                          \
        v                           v
[ PostgreSQL ]               [ Bucket S3: midia ]
  gerenciado (backup           privado, sem URL
  automatico)                  publica
```

O front nunca fala com o banco nem com o storage diretamente. Tudo passa pela API, inclusive os arquivos: o navegador envia a foto para a API, que valida e grava no bucket, e para ler pede à API, que confere a posse e devolve o conteúdo. Detalhe e justificativa em 6.8.

## 6.4 Frontend

Stack: React 18 com Vite e TypeScript, Tailwind CSS, React Router, TanStack Query pra dados de servidor (cache, revalidação, estados de carregamento), React Hook Form com Zod nos formulários.

Organização por feature, como já descrito em `docs/05`: cada módulo (leads, funnel, tasks, documents, visits, simulations, dashboard) agrupa suas telas, hooks e componentes. A camada de acesso à API fica em `src/api/`, com um cliente HTTP único que injeta o token, renova sessão expirada e padroniza erros.

O contrato com o back é gerado: a partir do OpenAPI da API, geramos os tipos TypeScript do front (openapi-typescript ou similar). Front e back nunca divergem de contrato sem o build acusar.

Regras que continuam valendo do resto da spec: mobile-first, quatro estados de tela em toda lista (carregando, vazio, erro, sucesso), interface em português com formatos brasileiros.

## 6.5 Backend

NestJS com TypeScript. A escolha do NestJS (em vez de Express/Fastify puro) é deliberada pra um produto: arquitetura modular imposta pelo framework, injeção de dependência, validação de entrada declarativa, guards de autenticação e autorização, interceptors pra logging e o OpenAPI gerado das próprias rotas. Isso reduz decisão arbitrária e deixa o código uniforme mesmo com mais gente entrando no projeto. Por baixo, o NestJS roda sobre Fastify pra melhor performance.

Módulos do domínio, espelhando as features do front e os requisitos de `docs/04`:

```
src/
├─ auth/            login, registro, refresh, recuperação de senha
├─ brokers/         perfil do corretor
├─ leads/           CRUD, busca, filtros, funil, mudança de status, timeline
├─ tasks/           próximas ações, agenda, alertas de follow-up
├─ documents/       checklist, URLs assinadas de upload/download, status
├─ properties/      cadastro leve de imóveis
├─ visits/          visitas e imóveis apresentados
├─ simulations/     registro de simulações
├─ dashboard/       métricas e alertas agregados
└─ common/          guards, filtros de erro, paginação, utilitários
```

Regras transversais:

**Autorização por dono.** Todo registro de negócio tem `broker_id`. Um guard global garante que qualquer consulta e qualquer escrita filtram pelo corretor autenticado, extraído do JWT, nunca do corpo da requisição. É a versão em aplicação da regra que antes seria RLS: mesma garantia, agora centralizada na API. Testes automatizados com dois corretores confirmam o isolamento.

**Validação na borda.** Toda entrada passa por DTO validado. Nada chega ao serviço sem estar no formato certo. Os erros voltam padronizados (código, mensagem, campo).

**Timeline como efeito.** Os serviços que mudam status, criam tarefa, sobem documento ou registram visita/simulação gravam a `lead_activity` correspondente na mesma transação. A timeline nunca fica inconsistente com o dado.

**Transações.** Operações compostas (ex.: marcar `reativar_futuro` e criar a tarefa de reativação) rodam em transação Prisma.

**Paginação e busca.** Listas paginam por cursor (`created_at` + `id`), busca de leads por nome/WhatsApp usa índice (`ILIKE` com trigram se necessário).

## 6.6 Autenticação e sessão

Fluxo: registro cria o usuário com senha em Argon2id. Login devolve um access token JWT de vida curta (15 min) e um refresh token de vida longa (30 dias) guardado em cookie httpOnly ou storage seguro. O front renova o access token de forma transparente; logout revoga o refresh token (tabela de tokens revogados ou rotação com detecção de reuso). Recuperação de senha por e-mail com token de uso único e expiração.

O JWT carrega só o essencial: `sub` (id do broker) e `exp`. Nada de dado pessoal no token.

E-mail transacional (recuperação de senha, boas-vindas) via serviço dedicado: Resend ou Amazon SES. No MVP só esses dois e-mails; sem marketing.

## 6.7 Banco de dados

PostgreSQL gerenciado, hoje o Supabase usado **só como banco** (o código não sabe qual é, é uma connection string). A API conecta pelo pooler; migration usa a conexão direta, declarada como `directUrl` no Prisma, porque o pooler não aceita comandos de alteração de estrutura. O modelo de dados é exatamente o de `docs/02`: mesmas tabelas, colunas, enums e índices. O que muda é onde a regra de acesso mora: em vez de políticas RLS no banco, o isolamento por `broker_id` é aplicado pela API (6.5). O banco continua tendo as foreign keys, constraints e enums como defesa de integridade.

Migrações: Prisma Migrate, versionadas no repositório, aplicadas por pipeline (nunca na mão em produção). O schema Prisma é a fonte da verdade e gera os tipos usados no back.

Backup: diário automático do provedor gerenciado, com teste de restauração documentado antes do lançamento. Dados sensíveis (CPF, documentos) pedem isso por LGPD, não é opcional.

## 6.8 Mídia e documentos (storage)

Implementado em 22/07/2026. Bucket privado compatível com S3, hoje o Storage do Supabase, no mesmo projeto do banco.

**O arquivo sempre passa pela API.** O navegador envia para a API, que valida e grava no bucket; para ler, o navegador pede à API, que confere a posse e devolve o conteúdo. Nenhum arquivo tem URL pública, e o bucket não é acessível de fora.

Isso diverge do desenho original desta seção, que previa URL assinada e upload direto do navegador para o bucket. A escolha foi deliberada, por três razões: o modelo de segurança do produto já está na API (`broker_id` do token, ver 6.6), a validação de tipo e tamanho precisa acontecer antes de o arquivo existir, e o front não precisa conhecer o bucket. O custo é que o arquivo trafega duas vezes, o que é irrelevante no volume de hoje.

URL assinada continua sendo o caminho para quando isso pesar, e a troca é localizada: só o `StorageService` muda.

**Dois modos, escolhidos pela variável `STORAGE_DRIVER`:**

| Modo | Onde grava | Uso |
|---|---|---|
| `local` | disco, em `STORAGE_DIR` | desenvolvimento |
| `s3` | bucket compatível com S3 | produção, obrigatório |

O caminho do objeto é idêntico nos dois modos, `brokers/{broker_id}/properties/{property_id}/{images\|videos}/{media_id}.{ext}`, então o `storage_path` gravado no banco não muda e trocar de modo não exige migração de dados.

Em produção o modo `local` não serve: o disco do servidor é recriado a cada publicação e os arquivos seriam perdidos. A validação de ambiente falha na subida, e não no primeiro upload, se `STORAGE_DRIVER=s3` vier sem as credenciais do bucket.

Excluir apaga o objeto de verdade, no mesmo fluxo que marca o registro como removido (requisito LGPD de `docs/04`). Chaves de objeto não são adivinháveis, e mesmo que fossem não haveria acesso sem passar pela API.

## 6.9 API: convenções

REST em JSON, versionada por prefixo (`/v1`). Recursos no plural (`/v1/leads`, `/v1/leads/:id/tasks`, `/v1/leads/:id/documents`). Verbos HTTP semânticos, códigos de status corretos, erros no formato padronizado. OpenAPI gerado das rotas e publicado no ambiente de desenvolvimento; é dele que o front gera os tipos.

Proteções na borda: rate limiting por IP e por usuário, CORS restrito ao domínio do front, helmet (headers de segurança), tamanho máximo de payload, logs de acesso sem dado sensível.

## 6.10 Repositório e ambientes

Monorepo com pnpm workspaces:

```
nexlar/
├─ apps/
│  ├─ web/          (front React)
│  └─ api/          (NestJS)
├─ packages/
│  └─ shared/       (tipos e validações Zod compartilhados quando fizer sentido)
├─ docs/            (esta especificação)
├─ railway.json         (build e start da API em produção)
├─ vercel.json          (build do front e rewrite de /api para a API)
└─ .github/workflows/   (CI)
```

Desenvolvimento local roda com Postgres na máquina e storage em disco. Não precisa de conta em nuvem nem de Docker para desenvolver.

**Dois ambientes hoje**, não três: desenvolvimento (local) e produção. Staging ainda não existe e só passa a fazer sentido quando houver corretor de verdade usando, porque hoje quebrar produção não afeta ninguém. Toda configuração por variável de ambiente, com `.env.example` e `.env.production.example` versionados e segredos sempre fora do repositório.

Deploy é por git: publicar na `main` publica os dois. Migration de banco **não** roda no deploy, é ato deliberado, para que uma alteração de estrutura em produção nunca seja efeito colateral de uma publicação.

## 6.11 Hospedagem

No ar desde 22/07/2026.

| Peça | Onde | Configuração |
|---|---|---|
| Front | Vercel, site estático | `vercel.json` |
| API | Railway, container | `railway.json` |
| Banco e storage | Supabase, região `us-east-1` | fora do repositório |

**O front chama a API pelo caminho relativo `/api`.** Em desenvolvimento quem resolve isso é o proxy do Vite; publicado, é o rewrite declarado no `vercel.json`, que encaminha para o Railway. Como o redirecionamento acontece no servidor, o navegador enxerga tudo na mesma origem, então não há CORS envolvido e o front não precisa de variável com a URL da API.

**API e banco ficam na mesma região, sempre.** Uma tela faz várias consultas ao banco e uma só viagem até o corretor, então distância entre API e banco custa muito mais caro que distância até o usuário. O Railway não tem região na América do Sul (só Singapura, Amsterdã, US East e US West), por isso os dois ficam em US East. Se um dia mudar para plataforma com região no Brasil, mover os dois de uma vez, nunca um só.

Migrar de provedor mais tarde é mudança de infraestrutura, não de código: o banco é Postgres por connection string, o storage é protocolo S3, e a API é um processo Node comum.

## 6.12 Observabilidade e qualidade

Logs estruturados (pino) com request id, sem dado pessoal. Sentry (ou equivalente) pra erros de front e back desde o primeiro deploy. Healthcheck na API (`/health`) monitorado por uptime checker gratuito. Métricas simples no início; APM fica pra quando houver tráfego que justifique.

Testes: unitários nos serviços de domínio (regras de status, alertas de follow-up, cálculo de métricas do dashboard são os alvos de maior valor), testes de API por módulo cobrindo os critérios de aceite de `docs/03`, incluindo o teste de isolamento com dois corretores, e um fluxo E2E básico (Playwright) do caminho feliz: cadastrar lead, criar tarefa, mover no funil, fechar.

## 6.13 Preparado pro futuro (sem construir agora)

Decisões de agora que deixam as fases 2 a 4 baratas: o `broker_id` em tudo vira a chave de carteira quando entrar imobiliária (fase 4, quando nascerá `agency_id` e papéis); a API versionada permite app mobile nativo ou integrações sem tocar no front; a página pública do corretor (fase 2) será só mais um consumidor da mesma API com rotas públicas; webhooks e integração com WhatsApp entram como módulos novos no NestJS; cobrança (Stripe ou gateway nacional) entra como módulo `billing` sem afetar o domínio.

Nada disso entra no MVP. Está aqui só pra garantir que nenhuma decisão de hoje bloqueia o amanhã.
