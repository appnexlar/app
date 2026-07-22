# Prompt de execução: Marco 1, monorepo e autenticação

Cole este documento inteiro como instrução para o Claude Code, dentro da pasta raiz do projeto Nexlar. Ele descreve exatamente o que construir nesta etapa, o que já existe e não deve ser recriado, e os critérios que definem que a etapa está pronta.

## Contexto do projeto

Leia primeiro `CLAUDE.md` na raiz do repositório e, em seguida, os documentos em `docs/`, nesta ordem: `01-visao-e-stack.md`, `02-modelo-de-dados.md`, `03-jornadas.md`, `04-requisitos.md`, `06-arquitetura-tecnica.md`, `05-guia-claude-code.md`. Esses documentos são a especificação oficial do produto e da arquitetura. Não decida arquitetura por conta própria onde a especificação já decidiu.

## O que já existe no repositório (não recriar, não sobrescrever)

- `package.json` e `pnpm-workspace.yaml` na raiz, já configurando o monorepo pnpm com `apps/*` e `packages/*`.
- `apps/web/tailwind.config.ts`: já expõe os tokens semânticos do design system (cores, tipografia, radius, sombra). Componentes devem consumir essas classes semânticas (`bg-surface`, `text-muted`, `bg-accent`, etc.), nunca cor crua.
- `apps/web/src/styles/tokens.css`: fonte única dos tokens de design (cor primária navy `#243746`, acento laranja `#D2502E`, neutros quentes, fonte Plus Jakarta Sans, espaçamento, radius, sombra, breakpoints mobile-first).
- `apps/web/src/design-system/reference.html`: guia visual de referência dos tokens e componentes básicos. Use como referência de estilo ao construir os componentes de UI desta etapa (formulários, botões, inputs, estados de erro).
- `Logo/Logo.svg` e `Logo/white.svg`: wordmark oficial.
- `Branding.pdf`: brand book completo, consulte se tiver dúvida de uso da marca.

Se algum desses arquivos estiver ausente ou incompleto quando você for executar, pare e avise antes de improvisar um design system novo.

## Escopo desta etapa: Marco 1 (esqueleto autenticado)

Esta é a primeira fatia vertical do produto, conforme `docs/05`, seção 5.3. O objetivo é ter o monorepo completo funcionando localmente com autenticação real de ponta a ponta. Nada de módulo de negócio (leads, funil, etc.) entra nesta etapa.

**1. Completar o scaffold do monorepo**, conforme `docs/06`, seção 6.10:
- `apps/api`: projeto NestJS com TypeScript, rodando sobre Fastify.
- `apps/web`: projeto Vite + React + TypeScript, usando o `tailwind.config.ts` e o `tokens.css` que já existem (não recrie do zero).
- `packages/shared`: pacote com tipos e schemas Zod compartilháveis entre front e back onde fizer sentido (a começar pelos DTOs de auth).
- `docker-compose.yml` na raiz: PostgreSQL 16 e MinIO (S3 local), para desenvolvimento local sem depender de conta em nuvem.
- `.env.example` em `apps/api` e `apps/web`, com todas as variáveis necessárias documentadas (nunca commitar `.env` real).
- CI básico em `.github/workflows/`: lint, typecheck e build dos dois apps a cada push.

**2. Modelar o banco com Prisma**, seguindo `docs/02` na íntegra (todas as entidades: `broker`, `lead`, `lead_activity`, `task`, `document`, `property`, `visit`, `visit_property`, `simulation`, com todos os enums, campos e índices descritos). Mesmo que só `broker` seja usado nesta etapa, modele o schema inteiro agora para não precisar migrar de novo a cada marco. Gere a migração inicial com Prisma Migrate.

**3. Construir o módulo de autenticação na API** (`apps/api/src/auth` e `apps/api/src/brokers`), cobrindo:
- Registro: nome completo, e-mail, senha (telefone e nome da imobiliária opcionais). Senha em Argon2id. Cria a linha em `broker`.
- Login: valida credenciais, devolve access token JWT (15 min) e refresh token (30 dias).
- Refresh: renova o access token a partir de um refresh token válido.
- Logout: revoga o refresh token.
- Recuperação de senha: solicitação gera token de uso único com expiração; endpoint de confirmação troca a senha. Não é necessário integrar envio de e-mail real nesta etapa; deixe a chamada ao provedor de e-mail isolada atrás de uma interface (`EmailService`) com uma implementação de log/console para desenvolvimento, para trocar por Resend/SES depois sem tocar no resto do código.
- Perfil: endpoint para ler e editar os dados do próprio corretor autenticado.
- Guard global de autenticação: todo endpoint fora de `auth` exige token válido e disponibiliza o `broker_id` autenticado para os módulos futuros usarem.
- Validação de entrada por DTO em todas as rotas, com class-validator ou Zod, conforme `docs/06`, seção 6.5.
- OpenAPI (Swagger) habilitado e navegável em desenvolvimento.

**4. Construir as telas correspondentes no front** (`apps/web/src/features/auth`):
- Tela de entrar (e-mail e senha).
- Tela de criar conta (nome, e-mail, senha, telefone e imobiliária opcionais).
- Recuperação de senha (solicitar e definir nova senha).
- Sessão persistente: usuário logado continua logado ao fechar e reabrir o navegador; renovação de token é transparente.
- Rota protegida: uma tela de Dashboard vazia, só acessível autenticado, com uma mensagem de estado vazio orientando a cadastrar o primeiro lead (mesmo que o cadastro de lead ainda não exista, o texto e o layout do estado vazio devem estar prontos).
- Use React Hook Form com Zod para os formulários, TanStack Query para as chamadas à API, e o cliente HTTP único descrito em `docs/05`/`docs/06` (injeta token, renova sessão expirada, padroniza erros).
- Toda tela trata os quatro estados (carregando, vazio, erro, sucesso), conforme `docs/04`, seção NFR.
- Visual construído inteiramente com os tokens e classes semânticas já existentes em `tailwind.config.ts`/`tokens.css`. Não introduza cor, fonte ou radius fora do design system.
- Interface em português do Brasil.

## Fora de escopo nesta etapa

Não construa: módulo de leads, funil, tarefas, documentos, visitas, simulações ou dashboard com métricas reais. Não construa validação de CRECI, página pública, formulário público, nem qualquer item listado como fora do MVP em `docs/04`, seção 4.9. Se notar necessidade de algo desses módulos para fazer login funcionar, pare e pergunte antes de expandir escopo.

## Critérios de aceite (definição de pronto desta etapa)

Baseados em `docs/03`, jornada J0, e `docs/04`, requisitos AUTH-01 a AUTH-05:

- Com `docker compose up` e as migrações aplicadas, é possível rodar `apps/api` e `apps/web` localmente sem nenhuma dependência de conta em nuvem.
- Consigo criar conta informando nome, e-mail e senha, e existe a linha correspondente em `broker` no banco.
- Tentar criar conta com e-mail já existente mostra mensagem clara e não cria duplicata.
- Consigo sair e entrar de novo com as mesmas credenciais; a sessão persiste ao recarregar a página.
- Não consigo acessar a rota de Dashboard sem estar autenticado; sou redirecionado para a tela de entrar.
- Um teste automatizado de API confirma que o token de um corretor não concede acesso ao perfil de outro corretor.
- O fluxo de recuperação de senha funciona de ponta a ponta em desenvolvimento (o "envio" de e-mail aparece no log/console).
- Lint, typecheck e build passam nos dois apps.
- Existem testes automatizados cobrindo registro, login, refresh, logout e o guard de autenticação.
- A interface das telas de auth usa exclusivamente os tokens de design já existentes e funciona bem em viewport de celular.

## Ao terminar

Rode lint, typecheck, build e os testes automatizados antes de reportar a etapa como concluída. Se algo dos critérios acima não puder ser cumprido, explique o motivo em vez de marcar como pronto. Não avance para o Marco 2 (leads) sem confirmação: essa é a próxima etapa e um novo prompt será fornecido para ela.
