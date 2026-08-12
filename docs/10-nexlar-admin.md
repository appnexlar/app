# Nextlar Admin: análise técnica (Task 1 da épica)

Data: 10 ago 2026. Nenhuma linha de código foi alterada para esta análise.
Este documento responde às doze perguntas da Task 1 e propõe a arquitetura
das fases seguintes. As decisões marcadas com **[DECISÃO]** precisam de
aprovação antes da implementação.

---

## 1. A arquitetura atual, explicada

### 1.1 Autenticação

A autenticação é própria (não usa o Auth do Supabase) e vive em
`apps/api/src/auth/`:

| Peça | Como funciona hoje |
|---|---|
| Access token | JWT de 15 min, payload mínimo `{ sub: brokerId }`, segredo `JWT_ACCESS_SECRET` |
| Refresh token | Opaco, guardado só como hash, rotacionado a cada uso, em cookie httpOnly `Secure SameSite=Lax` com `path=/api/auth`. Reuso detectado revoga a família inteira (`refresh_token.revoke_reason`) |
| Login por senha | Argon2id, com trava por conta (`LoginAttemptService`) e rate limit por IP |
| Login pelo Google | OpenID Connect com state e nonce anti-CSRF em cookie de uso único; conta social pode não ter senha (`password_hash` nulo) |
| Confirmação de e-mail | `email_verified_at` no banco é a fonte da verdade; o guard barra quem não confirmou |
| Recuperação de senha | Token de uso único com TTL, e-mail via Resend |
| Guard global | `JwtAuthGuard` roda em toda rota exceto `@Public()`. Valida assinatura E consulta o banco a cada requisição (status + e-mail confirmado), então suspensão vale imediatamente, não no próximo refresh |

O dado mais importante para o Admin: **não existe role nenhuma**. Todo token
válido é um corretor, e `request.broker = { brokerId }` é tudo que os módulos
recebem. Não há campo de papel no token, no banco, em lugar nenhum. Isso é
bom: nascemos sem gambiarra de `if email == "admin@..."` para desmontar.

### 1.2 Usuários

`Broker` é o único modelo de conta (schema.prisma:280). Campos relevantes
para o Admin:

- Identidade: `full_name`, `email` (único), `phone`, `avatar_key`, `google_id`
- Profissional: `creci`, `creci_uf`, `creci_status` (nao_enviado, pendente,
  aprovado, recusado), `creci_document_key` (bucket privado), datas e motivo
  de recusa
- Conta: `status` (**só `ativo` e `suspenso`**), `email_verified_at`,
  `suspended_reason`, `suspended_at`, aceite de termos com versão,
  `marketing_opt_in`, timestamps
- Onboarding: relação 1:1 com `OnboardingProfile` (diagnóstico)

**Lacuna:** não existe `last_login_at`. A melhor aproximação hoje é o
`created_at` do refresh token mais recente do corretor.

**CRECI hoje é operado por CLI** (`apps/api/scripts/creci.ts`: fila,
documento, aprovar, recusar), rodada manualmente pela Rafaelle contra o banco
de produção. O Admin substitui exatamente esse fluxo por uma tela, e o script
vira ferramenta de contingência.

### 1.3 Organizações

**Não existem.** Não há tabela, não há vínculo, não há tenant. O comentário
no próprio schema (linha 1481) é explícito: "por corretor; não existe
organization_id". O isolamento de todos os 30+ modelos de domínio é por
`broker_id`. `agency_name` é um texto solto no perfil, sem entidade por trás.

Consequência: a Fase 4 da épica (gestão de organizações) exige criar o
conceito do zero, e a forma de criá-lo é a decisão de maior risco da épica
inteira (ver §5.2).

### 1.4 Segurança

- **Isolamento:** `broker_id` vem sempre do JWT, nunca do payload; testes e2e
  de dois corretores cobrem os módulos. Regra registrada no CLAUDE.md.
- **RLS:** a migration `20260722170000_blindagem_supabase` liga RLS em todas
  as tabelas e revoga tudo de `anon`/`authenticated`, inclusive por default
  para tabelas futuras. Isso fecha a API HTTP do Supabase; o único cliente do
  banco é a API NestJS. Tabelas novas precisam repetir o `ENABLE ROW LEVEL
  SECURITY` (o revoke de privilégio já pega por default).
- **Rate limit:** decorator `@RateLimit` por rota + guard. Pendência conhecida:
  `TRUST_PROXY_HOPS=0` em produção desliga a trava por IP (a por conta segue).
- **Headers:** helmet/CSP configurados no bootstrap.
- **Storage:** bucket privado, URLs nunca públicas, quem serve é a API após
  conferir posse.

### 1.5 Atividade e auditoria existentes

Duas estruturas, com papéis diferentes, e nenhuma serve pronta para o Admin:

| | `audit_log` | `product_event` |
|---|---|---|
| Propósito | Trilha LGPD de alterações em dados de cliente | "Sistema nervoso" da jornada guiada (marcos de uso) |
| Ator | O próprio corretor | O próprio corretor |
| Apaga junto com a conta? | **Sim (CASCADE)** | Sim (CASCADE) |
| Tem estado anterior/novo? | Não (só metadata) | Não |
| Serve para auditoria administrativa? | Não | Não |

O CASCADE é o ponto crítico: trilha de auditoria administrativa **não pode
sumir quando a conta some**, senão a exclusão de uma conta apaga a prova das
ações administrativas sobre ela. O Admin precisa de uma tabela própria, sem
cascade, com ator administrativo e estado antes/depois (é o formato que a
épica pede na Task 27).

Eventos de login: não são registrados hoje (só o marco único
`FIRST_LOGIN_COMPLETED` no product_event). `LOGIN_SUCCEEDED`/`LOGIN_FAILED`
precisam nascer.

### 1.6 Infraestrutura

- **Monorepo pnpm:** `apps/api` (NestJS + Fastify + Prisma), `apps/web`
  (React + Vite), `packages/shared` (DTOs e validação Zod compartilhados).
- **Front:** SPA única, rotas em `App.tsx`, shell próprio
  (`features/shell/`: AppLayout, Sidebar, MobileDrawer, AppHeader), design
  system em `components/ui/` (Button, Modal, ConfirmDialog, SearchField,
  FilterChips, Pagination, SmartEmptyState, Spinner...), tokens com grade de
  8 em `styles/tokens.css`, TanStack Query para dados.
- **Deploy:** Vercel (SPA + rewrite de `/api` para a Railway), Railway (API),
  Supabase (Postgres + Storage). Gatilho de deploy pela branch `main`.
- **Testes:** e2e por módulo na API (247 passando), com padrão consolidado de
  teste de isolamento entre dois corretores.

---

## 2. O que é reutilizável (e o que não é)

### Reutilizável como está

- **Padrões do auth:** Argon2id, rotação de refresh com hash, cookie httpOnly,
  rate limit por rota, trava por conta. A mecânica é a mesma; muda a tabela e
  o segredo.
- **Design system inteiro:** os componentes de `components/ui/` servem o
  Admin sem alteração. Tabela, que o Admin usa muito, hoje é composição por
  tela (não há componente Table), e o Admin pode introduzir um.
- **Tokens e grade de 8:** o Admin nasce já na regra
  (`--space-1/2/3` = 8/16/24), sem herdar débito visual.
- **Padrão de módulo NestJS:** controller + service + DTOs Zod no shared +
  testes e2e. O Admin segue o molde de qualquer módulo existente.
- **Padrão de agregados:** `dashboard.service.ts` já faz counts em paralelo
  com `Promise.all`; o dashboard administrativo é a mesma técnica sem o
  filtro de `brokerId`.
- **ConfirmDialog:** a regra "todo botão destrutivo pede confirmação" já é
  praticada e tem componente pronto.

### NÃO reutilizável (e por quê)

- **`JwtAuthGuard` e o token do corretor:** um token de corretor jamais pode
  passar num guard de admin. Segredo separado e claim de tipo separada.
- **`audit_log`:** cascade + ator corretor + sem estado anterior. Fica como
  está, servindo à LGPD do corretor; o Admin ganha tabela própria.
- **`RefreshToken`:** amarrado a `broker_id`. Sessão administrativa ganha
  tabela própria (TTLs diferentes, política diferente).
- **Shell do front:** o layout do corretor é mobile-first com bottom
  navigation; o Admin é desktop-first com sidebar densa. Compartilham
  componentes de base, não o shell.

---

## 3. Riscos identificados

| # | Risco | Gravidade | Mitigação proposta |
|---|---|---|---|
| R1 | **Elevação de privilégio** se o admin for um flag no Broker (um UPDATE numa injeção qualquer viraria admin) | Alta | Admin em tabela separada, segredo JWT separado, guard separado. Corretor e admin são universos disjuntos |
| R2 | **Trilha de auditoria apagável** se reusar audit_log com cascade | Alta | `admin_audit_log` sem FK cascade para o alvo (guarda id + snapshot textual) |
| R3 | **Exposição de dado pessoal além da finalidade** (LGPD art. 6º): admin vendo CPF/renda de leads dos corretores | Alta | DTOs administrativos próprios, só agregados de uso; nunca listar dados de leads/clientes individuais no Admin nesta épica |
| R4 | **Bootstrap do primeiro SUPER_ADMIN** (ovo e galinha: quem cria o primeiro admin?) | Média | Script de seed nos moldes do `creci.ts`, rodado pela Rafaelle com o `.env.production`; nunca endpoint público de setup |
| R5 | **Migração de organização quebrar o app do corretor** | Alta | Organização nasce como camada NOVA (backfill 1:1), sem tocar no isolamento por `broker_id` de nenhuma consulta existente |
| R6 | **Sessão administrativa longa demais** | Média | TTLs curtos próprios (access 10 min, refresh 8h absoluto), invalidação no logout, arquitetura pronta para MFA |
| R7 | **Rate limit por IP desligado em produção** (TRUST_PROXY_HOPS=0) | Média | Corrigir a variável na Railway antes de expor `/api/admin/auth/login` |
| R8 | **Enumeração de contas** pela busca administrativa se um guard falhar | Média | Prefixo `/api/admin` inteiro atrás de guard de classe + testes e2e de intrusão (corretor batendo em cada rota admin) |
| R9 | **Status novo de usuário conflitar com o gate existente** (`pendente_verificacao` versus `email_verified_at`) | Média | Não duplicar estado: derivar "pendente" do `email_verified_at` (ver decisão D3) |

---

## 4. Lacunas (o que não existe e a épica precisa)

1. Organização (tabela, vínculo, status)
2. Qualquer noção de role ou permissão
3. Usuário administrativo e sua autenticação
4. Auditoria com ator administrativo e estado antes/depois
5. `last_login_at` e eventos de login
6. Status de usuário além de ativo/suspenso (bloqueado, desativado)
7. Notas internas
8. Estrutura de billing
9. Tela para o fluxo de CRECI (hoje é CLI)
10. Componente de tabela densa com ordenação (o front nunca precisou)

---

## 5. Arquitetura proposta para o Nextlar Admin

### 5.1 Princípio: dois universos, uma API, um deploy

```text
apps/api/src/admin/            apps/web/src/features/admin/
├── auth/      (login, sessão) ├── shell/     (layout próprio, sidebar densa)
├── rbac/      (guard, perms)  ├── dashboard/
├── dashboard/ (agregados)     ├── users/
├── users/                     ├── organizations/
├── organizations/             ├── audit/
├── audit/                     └── api/       (cliente HTTP do admin)
└── notes/
```

- **Mesma API NestJS**, sob o prefixo `/api/admin/*`, com guard próprio
  aplicado no módulo inteiro. Nenhum endpoint administrativo depende de
  proteção de front.
- **Mesma SPA**, sob `/admin/*`, com **lazy loading** (o corretor não baixa
  um byte do código do Admin) e layout próprio. **[DECISÃO D1]** A
  alternativa (um `apps/admin` separado) daria isolamento de bundle perfeito,
  mas custa extrair o design system para um pacote e manter um terceiro
  deploy; como a autoridade é toda do backend, o ganho real é pequeno.
  Recomendo mesma SPA agora, extração futura se o Admin crescer.

### 5.2 Organização: nascer como camada, não como reforma

**[DECISÃO D2]** Criar `organization` + `organization_member` e fazer
backfill de uma organização por corretor existente (o corretor vira `owner`).
O aplicativo do corretor **não muda em nada** nesta épica: todo isolamento
segue por `broker_id`. A organização existe como agrupamento administrativo e
alicerce para multiusuário futuro.

A alternativa (migrar o isolamento inteiro para `organization_id`) tocaria 30+
modelos e todos os serviços; é a reforma mais perigosa possível e não é
pré-requisito de nada que a épica pede.

### 5.3 Admin é gente separada, não flag

`admin_user` é tabela própria. E-mail, Argon2id, role, status, timestamps.
Sem relação nenhuma com `broker`. Se uma pessoa da equipe também for
corretora, são duas contas, e isso é uma virtude: os universos não se tocam.

Autenticação administrativa com:

- segredo próprio (`JWT_ADMIN_SECRET`) e claim `typ: "admin"`: um access
  token de corretor não passa no guard admin nem por acidente, e vice-versa
- refresh próprio (`admin_refresh_token`), cookie httpOnly com
  `path=/api/admin/auth`, TTLs curtos (access 10 min, sessão máxima 8h)
- rate limit dedicado no login, trava por conta reaproveitando o padrão do
  `LoginAttemptService`
- espaço reservado para MFA (coluna `mfa_secret` nula desde já, sem UI)

### 5.4 RBAC: roles concedem permissões, guards verificam permissões

```text
shared/src/admin/permissions.ts   (fonte única, tipada)

ROLE_PERMISSIONS = {
  SUPER_ADMIN: [tudo],
  ADMIN:       [admin.users.view, admin.users.manage,
                admin.organizations.view, admin.organizations.manage,
                admin.creci.view, admin.creci.manage, admin.audit.view],
  SUPPORT:     [admin.users.view, admin.organizations.view, admin.creci.view],
  FINANCE:     [admin.billing.view, admin.billing.manage],
}
```

No backend: `AdminAuthGuard` (autentica) + `@RequirePermission("admin.users.manage")`
com `AdminPermissionGuard` (autoriza). Tela nenhuma verifica nome de role; o
front só usa as permissões (devolvidas no login) para esconder o que não pode,
e o backend é quem nega.

### 5.5 Modelos novos (Prisma)

| Modelo | Campos essenciais | Observações |
|---|---|---|
| `AdminUser` | id, email único, password_hash, full_name, role (enum), status (ativo/suspenso), mfa_secret?, last_login_at, timestamps | |
| `AdminRefreshToken` | espelho do RefreshToken, FK admin_user | |
| `Organization` | id, name, status (enum: ativa/suspensa/cancelada + preparados trial/inadimplente), suspended_reason/at, timestamps | |
| `OrganizationMember` | organization_id, broker_id único, role interna (owner/member), joined_at | broker_id único = um corretor, uma organização, por ora |
| `AdminAuditLog` | id, actor_admin_id (FK **Restrict**), actor_role, action, resource_type, resource_id (String, **sem FK**), previous_state Json?, new_state Json?, reason?, created_at | Nunca cascade; sobrevive à exclusão do alvo |
| `AdminNote` | id, author_admin_id, resource_type (user/organization), resource_id, body, edited_at?, timestamps | Corretor nunca vê |
| `OrganizationBilling` | organization_id único, provider (none/manual/asaas), provider_customer_id?, provider_subscription_id?, plan_id?, subscription_status (none/trial/active/past_due/cancelled/suspended), billing_cycle?, períodos e datas do contrato da épica | Nasce vazia; nada controla acesso |

Mudanças em modelos existentes (mínimas):

- `Broker`: acrescentar `last_login_at` (atualizado no login e no refresh) e
  os valores novos do enum de status: `bloqueado`, `desativado`.
  **[DECISÃO D3]** `PENDING_VERIFICATION` não vira valor de enum: já existe
  como `email_verified_at IS NULL`, e duplicar estado cria os bugs de
  dessincronia clássicos. O Admin apresenta "pendente de verificação" como
  status **derivado**.
- `ProductEvent`: nenhum campo novo; entram tipos novos no catálogo
  (`LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `EMAIL_VERIFIED`...), que o serviço
  já valida por lista.

Nomenclatura: o schema inteiro está em português (`ativo`, `pendente`...).
**[DECISÃO D4]** Manter o padrão do projeto nos enums novos (`suspenso`,
`bloqueado`, `desativado`; roles `super_admin`, `admin`, `suporte`,
`financeiro`), mapeando para os nomes da épica na documentação. Misturar
inglês agora criaria duas línguas no mesmo banco.

### 5.6 Migrations necessárias (em ordem, cada uma com RLS)

1. `organization` + `organization_member` + backfill (uma org por corretor,
   nome vindo de `agency_name` ou do nome do corretor) + RLS
2. `admin_user` + `admin_refresh_token` + RLS
3. `admin_audit_log` + `admin_note` + RLS
4. `broker`: `last_login_at` + valores novos do enum de status
5. `organization_billing` + RLS

Todas aditivas. Nenhuma altera linha existente além do backfill da 1, que é
idempotente e verificável (count de brokers = count de orgs).

### 5.7 Endpoints (prefixo /api/admin, todos atrás dos dois guards)

```text
auth:           POST /auth/login  POST /auth/refresh  POST /auth/logout
                GET  /auth/me    (identidade + permissões)

dashboard:      GET /dashboard/summary?periodo=7d|30d|90d|hoje
                (usuários, organizações, uso agregado, cadastros recentes,
                 alertas: CRECI pendente, contas suspensas...)

usuários:       GET   /users            (busca + filtros + paginação)
                GET   /users/:id        (perfil administrativo completo)
                POST  /users/:id/suspend    { reason }
                POST  /users/:id/reactivate { reason }
                PATCH /users/:id/creci      { status, reason? }
                GET   /users/:id/activity

organizações:   GET   /organizations
                GET   /organizations/:id
                POST  /organizations/:id/suspend    { reason }
                POST  /organizations/:id/reactivate { reason }

auditoria:      GET /audit  (filtros: ator, ação, recurso, período)

notas:          GET/POST /notes?resource=user:<id>
                PATCH    /notes/:id

administração:  GET/POST/PATCH /admins   (só super_admin)
```

Toda ação de escrita grava `admin_audit_log` na mesma transação da mudança:
ou as duas acontecem, ou nenhuma.

### 5.8 Front (rotas /admin, lazy, layout próprio)

```text
/admin/login
/admin                    (dashboard)
/admin/usuarios           (+ /admin/usuarios/:id)
/admin/organizacoes       (+ /admin/organizacoes/:id)
/admin/atividade
/admin/auditoria
/admin/administradores    (só super_admin)
```

Componentes novos: `AdminLayout` (sidebar densa, sem bottom nav),
`DataTable` (ordenação, densidade, estados), `StatCard`, `StatusBadge`,
`AuditDiff` (antes/depois), `PeriodPicker`. Tudo sobre os tokens existentes,
grade de 8, e os quatro estados obrigatórios em toda tela.

Identidade visual: mesma família tipográfica e tokens, mas superfície
invertida no shell (sidebar escura navy) para ninguém confundir em qual
contexto está. Desktop primeiro; tablet funcional; mobile legível com ações
críticas seguras.

### 5.9 Segurança da suspensão (Tasks 16 e 25)

Suspender usuário: além de `status = suspenso`, revogar todos os refresh
tokens do corretor (a tabela e o motivo já existem). Como o `JwtAuthGuard`
consulta status a cada requisição, o acesso morre em no máximo uma requisição,
sem esperar expiração de token. Suspender organização: aplicar a mesma rotina
a cada membro, na mesma transação, com o impacto descrito no ConfirmDialog.

---

## 6. Arquivos que serão alterados (além dos novos)

| Arquivo | Mudança |
|---|---|
| `apps/api/prisma/schema.prisma` | Modelos e enums novos, `last_login_at` |
| `apps/api/src/app.module.ts` | Registrar `AdminModule` |
| `apps/api/src/auth/auth.service.ts` | Gravar `last_login_at` e emitir eventos de login |
| `apps/api/src/config/env.ts` | `JWT_ADMIN_SECRET` obrigatório |
| `packages/shared/src/index.ts` | Exportar `admin/` (DTOs, permissões, status) |
| `apps/web/src/App.tsx` | Bloco de rotas `/admin` com lazy loading |
| `apps/api/scripts/` | Script de seed do primeiro super_admin (getpass, padrão da casa) |
| `docs/` | Este documento evolui com cada fase |

O que **não** muda: nenhum service de domínio do corretor, nenhuma consulta
existente, nenhum comportamento do app do corretor.

---

## 7. Critérios que esta análise já garante por desenho

- Corretor não acessa o Admin: segredos JWT distintos + guard de classe
- Sem regra hardcoded de e-mail ou plano
- Permissão verificada no backend, sempre
- Auditoria imutável e à prova de exclusão do alvo
- Billing preparado sem nenhuma cobrança, provider `none` por padrão
- Admin não enxerga dado pessoal de leads/clientes: só agregados numéricos
- LGPD: finalidade administrativa restrita a dados do corretor e da conta

## 8. Decisões abertas para aprovação

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Admin na mesma SPA (lazy) ou app separado | Mesma SPA, lazy loading |
| D2 | Organização como camada nova com backfill 1:1 | Sim |
| D3 | "Pendente de verificação" derivado, não enum | Derivado |
| D4 | Enums novos em português, seguindo o schema | Português |

## 9. Fases seguintes (mapa da épica para o repositório)

| Fase da épica | Entrega técnica | Situação |
|---|---|---|
| 1 Fundação (Tasks 2 a 4) | Migrations, AdminModule, guards, RBAC, seed, login (mais o entrar com o Google) | Entregue |
| 2 Dashboard (5 a 10) | `/dashboard/summary`, tela com indicadores e alertas | Entregue |
| 3 Usuários (11 a 18) | Lista, busca, filtros, perfil, suspender/reativar | Entregue (CRECI adiado) |
| 4 Organizações (19 a 25) | Lista, perfil, suspensão em cadeia | A fazer |
| 5 Auditoria (26 a 29) | Eventos de login, tela de auditoria | Entregue |
| 6 Billing (30 a 33) | Migration 5, seção placeholder | A fazer |
| 7 Notas (34 a 35) | Notas internas, timeline | A fazer |
| 8 a 10 | Segurança, UX e testes permeiam cada fase, não ficam para o fim | Contínuo |

## 10. Fase 2 entregue: o Dashboard

`GET /api/admin/dashboard/summary?periodo=hoje|7d|30d|90d`, atrás dos dois
guards administrativos.

Três decisões desta fase, com o porquê:

**D5. Sem `@RequirePermission` na rota, com recorte dentro do serviço.** O
dashboard é a porta de entrada do painel: negar com 403 deixaria o perfil
financeiro sem lugar nenhum ao entrar. Em vez disso, quem não tem
`admin.users.view` recebe os blocos como `null`, e as consultas nem chegam ao
banco. O recorte é do servidor, não do front: nem o total de contas vaza.

**D6. Alerta só existe se tiver tela para resolver.** Entraram apenas
`contas_suspensas` e `verificacao_parada`, ambos com destino real
(`/admin/usuarios` já filtrado). Indicador sem ação vira ruído no topo, e ruído
no topo treina a pessoa a ignorar o topo. Contagem zero não aparece: a seção
mostra o estado tranquilo em vez de uma fila vazia.

**D7. O período compara com a janela anterior de mesma duração**, nunca com o
"dia anterior inteiro": comparar um período em curso com um período completo
faria toda manhã parecer uma queda.

A tela abre pelo que pede ação, depois o retrato das contas (que não depende do
período), o movimento com variação, o uso agregado e os cadastros recentes. O
bloco de uso traz contagem e nada mais: nenhum nome de lead ou cliente
atravessa esta fase, e um teste e2e garante isso procurando o dado no corpo da
resposta.

O status do corretor na lista passou a viver na URL (`?status=`), que foi o que
permitiu o alerta abrir a lista já filtrada.

## 11. Fase 5 entregue: a Auditoria

`GET /api/admin/audit` (filtros de ator, ação, recurso e período, paginado) e
`GET /api/admin/audit/actors`, ambos atrás de `admin.audit.view`. A tabela era
escrita desde a Fase 1; esta fase abriu a leitura e completou o que faltava
gravar.

**Somente leitura, por ausência.** Não existe rota para editar nem para apagar
uma linha, e um teste e2e tenta DELETE, PATCH e PUT para garantir que continue
assim. Auditoria que se apaga não audita ninguém.

**A entrada no painel virou trilha.** `admin_entrou` grava quem entrou e por
onde (senha ou Google), na mesma transação do último acesso.
`admin_login_recusado` grava a tentativa negada com o motivo (senha incorreta
ou conta suspensa). Duas escolhas aqui merecem registro:

- O ator de uma recusa é a **conta visada**, que nem sempre é a pessoa que
  tentou. É justamente por isso que a linha existe: para a dona da conta
  enxergar tentativas que não foram dela.
- Tentativa contra e-mail que não existe **não** vira linha. Sem conta não há
  ator, e registrar isso transformaria a trilha num diário de varredura. Essa
  contagem já é trabalho do limite de tentativas.

**O nome do alvo é resolvido em lote, depois da consulta.** A tabela não tem
chave estrangeira para o alvo (é o que a faz sobreviver à exclusão), e um join
por linha traria N+1 numa tela feita para paginar. Quando o alvo não existe
mais, a linha continua de pé e a tela diz "em conta já excluída", com o motivo
e o estado anterior intactos. Existe teste e2e que apaga a conta e confere que
a prova permanece.

**A trilha aparece duas vezes**: inteira em `/admin/auditoria`, e recortada por
conta dentro da ficha do corretor, atrás da mesma permissão. Quem não pode ler
a trilha inteira também não lê o pedaço dela.
