# 09 · Coleta de dados para simulação de financiamento: análise técnica

Entrega da Task 1 da épica. Analisa o que a Nexlar já tem, o que falta, os riscos
e a proposta de implementação. **Nada foi implementado nesta task.**

Data da análise: 29 jul 2026. Base: `main` em `5745966`.

---

## 1. Resumo executivo

A épica é menos verde do que parece. Dos blocos que ela pede, a Nexlar já tem em
produção: registro financeiro do cliente, participantes da composição de renda,
consentimento LGPD versionado, trilha de auditoria, timeline imutável da lead,
eventos de produto idempotentes, notificações com sino, links públicos com token,
rate limiting por rota pública, formulário público com honeypot, storage privado
com URL assinada e um modelo de simulação bancária.

O que não existe e precisa nascer: o conceito de **solicitação com ciclo de vida**
(link que expira, revoga e versiona respostas), **confirmação de identidade** do
cliente (OTP), **autosave com retomada**, **versão imutável das respostas** e o
**formulário público progressivo**.

Duas afirmações da épica não casam com a arquitetura real e precisam de ajuste
(seção 6): não existe `organization_id` (o isolamento é por `broker_id`) e não
existe envio programático de WhatsApp (o canal é link `wa.me`, quem envia é o
corretor).

---

## 2. O que já existe e se reaproveita

| A épica pede | Já existe | Veredicto |
|---|---|---|
| Renda, entrada, FGTS, banco preferido, dependentes (Tasks 7, 8, 10) | `ClientFinancial` (1:1 com a lead, Decimal 14,2) | Reaproveitar como **destino** dos dados aprovados |
| Participantes da composição (Task 9) | `ClientParticipant` (relação, CPF, contato) | Idem: destino, não formulário |
| Consentimento com versão do texto (Task 16) | `Consent` (purpose, textVersion, acceptedAt) | Reaproveitar; ganhar campo de origem |
| Auditoria sem conteúdo sensível (Task 26) | `AuditLog` (ação, entidade, metadata) | Reaproveitar como está |
| Timeline (Task 23) | `LeadActivity` imutável + `ProductEvent` com `dedupeKey` único por corretor | Reaproveitar; só nascem tipos novos de evento |
| Notificações (Task 24) | Módulo `notification` + sino no cabeçalho | Reaproveitar como está |
| Token seguro em link público (Task 3) | Dois padrões no código: seleção usa `randomBytes(16)` base64url **em texto puro** no banco; tokens de e-mail e senha usam **hash** (`tokenHash`) | Seguir o padrão **com hash** dos tokens de auth |
| Rate limiting e antienumeração (Task 3) | `@RateLimit` (decorator + guard + store em memória, por IP) já aplicado em toda rota pública | Reaproveitar; mesma régua da seleção |
| Formulário público com proteção contra robô | Interesse da vitrine: honeypot no shared + consentimento obrigatório | Reaproveitar o padrão |
| Storage privado (Task 26) | `StorageService` com driver local e S3, bucket privado | Reaproveitar como está |
| Registro de simulação (Task 21) | `Simulation` (banco, valores, prazo, parcela, subsídio, status, resultNotes) | É o alvo do pré-preenchimento; não recriar |
| Checklist documental (fluxo pós-simulação) | `Document` (docType, stage, status) | Fora desta épica, mas o encaixe existe |
| Validação estruturada de payload flexível | `property.details` é Json validado por Zod no shared | Mesmo padrão para as respostas do formulário |
| Prazo com expiração calculada no backend | `PropertySelection.expiresInDays` + `expiresAt` na ativação | Copiar a semântica (prazos diferentes, como a épica exige) |
| Isolamento e blindagem | `broker_id` do JWT em tudo + migrations de RLS com revoke para anon/authenticated | Obrigatório repetir nas tabelas novas |

## 3. Lacunas (não existe nada parecido)

1. **Solicitação com ciclo de vida.** Nenhuma entidade hoje tem o par
   revisão/correção/reenvio. É o coração da épica.
2. **OTP / confirmação de identidade.** Existem tokens de uso único por e-mail
   (verificação e senha), mas não código curto digitável com limite de
   tentativas. E não existe envio de WhatsApp pela plataforma (ver seção 6).
3. **Autosave com retomada.** Nenhum formulário da Nexlar salva rascunho no
   backend. Padrão novo: PATCH por seção + detecção de conflito por `updatedAt`.
4. **Versão imutável de respostas.** Nada hoje congela um snapshot versionado.
5. **Sessão leve pós-OTP.** A página pública da seleção é token na URL, sem
   estado. Aqui, depois do OTP, o cliente precisa de uma credencial de sessão
   curta (cookie httpOnly de escopo restrito, mesmo padrão do refresh).
6. **Criptografia de campo.** Não existe. O disco do Supabase é criptografado e
   o tráfego é TLS. Recomendação: não criar criptografia de campo no MVP;
   registrar como limitação consciente (a épica diz "quando aplicável").

## 4. Riscos

- **Dado sensível em rota pública.** CPF e renda passam a trafegar por endpoint
  sem login. Mitigação: OTP antes de qualquer leitura ou escrita, `Cache-Control:
  private, no-store` em tudo, nunca dado em URL ou query, rate limit agressivo,
  honeypot, RLS.
- **Interceptação do link.** O canal de entrega é o WhatsApp do corretor com o
  cliente. Se o link vazar, o OTP entregue **no mesmo canal** não protege nada.
  A proteção real vem de: OTP por um segundo canal quando houver (e-mail),
  validade curta, revogação imediata e o corretor revisando o que chegou.
  Risco residual documentado.
- **Divergência entre respostas e ficha.** O cliente declara renda X, a ficha
  do corretor já tinha Y. Política decidida (seção 5): na aprovação a ficha
  recebe os dados automaticamente, com auditoria, e só campo preenchido na
  submissão sobrescreve; a submissão imutável preserva o que o cliente enviou.
- **Estado demais.** Os 13 estados da épica misturam estado com fato datado.
  Máquina grande é onde nasce bug de transição (ver seção 6, sugestão 1).
- **Memória do rate limit.** O store é em memória por processo. Com uma réplica
  no Railway funciona; se um dia escalar réplicas, migra para o banco. Registrar.

## 5. Decisões tomadas (Rafaelle, 29 jul 2026)

1. **OTP por e-mail, sem login.** O cliente não cria conta: o código abre uma
   sessão leve (cookie httpOnly de escopo restrito e TTL curto). A solicitação
   exige e-mail na lead; quando não houver, o corretor informa ao criar a
   solicitação e o e-mail entra na ficha.
2. **Aplicar à ficha é automático na aprovação.** Regra de segurança: só
   sobrescreve campo que veio preenchido na submissão; campo em branco não
   apaga dado existente da ficha. A submissão imutável preserva o que chegou.
3. **Começa na ficha da lead.** A área geral "Dados para simulação" (Task 22)
   fica para depois do MVP, como foi com seleções.

## 6. Ajustes recomendados na épica (parecer de engenharia)

1. **Menos estados, mais timestamps.** `OPENED`, `IN_PROGRESS` e `RESUBMITTED`
   não são estados: são fatos datados. A seleção já resolveu isso
   (`viewedAt`/`viewCount` fora do status). `READY_TO_SEND` é derivável da
   validação, como o checklist de requisitos da página pública. Proposta:
   `rascunho, enviada, respondida, em_revisao, correcao_solicitada,
   aprovada_para_simulacao, expirada, revogada, arquivada` (9), com
   `firstOpenedAt`, `startedAt`, `submittedAt`, `currentVersion` cobrindo o resto.
2. **`organization_id` não existe.** A Nexlar é single-broker por conta, decisão
   registrada no schema. Usar `broker_id`, como todo o resto. Multiorganização é
   outra épica.
3. **`deal_id`:** a "negociação" hoje é `ClientNegotiation`, 1:1 com a lead. Não
   há entidade de negócio separada. Vincular a solicitação a `lead_id` (sempre) e
   `property_id` (opcional) cobre todos os pontos de entrada reais.
4. **Formulário não grava nas tabelas da ficha.** As respostas vivem em snapshot
   Json versionado e validado por Zod no shared (padrão `property.details`).
   Menos seis tabelas, imutabilidade de graça, e a ficha só muda com aprovação.
5. **Token com hash desde o dia um**, no padrão dos tokens de auth. E fica
   registrado como dívida: o `publicToken` da seleção está em texto puro no
   banco, vale corrigir num futuro passe de segurança.
6. **URL curta `/f/:token`**, no padrão do `/s/:token` da seleção, em vez de
   `/credito/dados/:token`.
7. **Envio por WhatsApp = link `wa.me` com mensagem pronta**, como a seleção
   faz. A épica insinua envio pela plataforma; não existe integração com a API
   do WhatsApp e criar uma não cabe nesta épica.

## 7. Proposta técnica

### 7.1 Modelo de dados (3 tabelas novas)

```text
financing_data_request
- id uuid, broker_id uuid, lead_id uuid, property_id uuid?
- code int autoincrement          (URL interna, padrão lead/seleção)
- status enum (9 estados da seção 6.1)
- token_hash text unique          (sha256 do token da URL; nunca o token)
- expires_in_days int?, expires_at timestamptz?
- first_opened_at, started_at, submitted_at, reviewed_at,
  approved_at, revoked_at timestamptz?
- current_version int default 0
- consent_version text?
- requested_sections text[]      (blocos que o corretor pediu)
- message text?                   (mensagem do corretor)
- created_at, updated_at

financing_data_draft              (rascunho mutável, autosave)
- id uuid, broker_id, request_id unique
- payload jsonb                   (validado por seção no shared)
- completed_sections text[]
- updated_at                      (base da detecção de conflito)

financing_data_submission         (versão imutável)
- id uuid, broker_id, request_id
- version int                     (unique por request)
- payload jsonb                   (snapshot congelado)
- consent_id uuid?                (FK para consent)
- correction_note text?           (quando a versão nasce de correção)
- correction_fields text[]?
- submitted_at
- @@unique([request_id, version])
```

OTP: tabela `financing_access_code` no molde exato de `PasswordResetToken`
(code_hash, expires_at, used_at, attempt_count), mais uma coluna de sessão não:
a sessão pós-OTP é cookie httpOnly assinado com escopo `request_id`, TTL curto.

Todas com índice por `broker_id`, RLS e revoke na migration de blindagem,
padrão das épicas anteriores.

### 7.2 Endpoints

```text
Corretor (JWT):
POST   /financing-requests                       cria rascunho
GET    /financing-requests?leadId=               lista da ficha
GET    /financing-requests/:code                 detalhe + versões
PATCH  /financing-requests/:code                 configura (seções, prazo, mensagem)
POST   /financing-requests/:code/send            gera token, ativa, devolve link wa.me
POST   /financing-requests/:code/revoke
POST   /financing-requests/:code/request-correction   {fields, note, novo prazo}
POST   /financing-requests/:code/approve         aprova p/ simulação e aplica
                                                 à ficha (automático, seção 5)

Público (token + rate limit, espelhando a régua da seleção):
GET    /public/financiamento/:token              estado mínimo (sem dados)
POST   /public/financiamento/:token/otp          dispara código
POST   /public/financiamento/:token/verify       valida código, abre sessão
GET    /public/financiamento/:token/form         rascunho (exige sessão)
PATCH  /public/financiamento/:token/form         autosave por seção (exige sessão)
POST   /public/financiamento/:token/submit       congela versão (exige sessão)
```

`Cache-Control: private, no-store` em todas as rotas públicas deste módulo.

### 7.3 Front

- Corretor: entrada "Solicitar dados para simulação" na ficha da lead/cliente
  (padrão do bloco unificado de imóveis), configuração em modal ou página,
  acompanhamento na própria ficha. Revisão em `/leads/:code/financiamento/:code`.
- Cliente: rota pública `/f/:token`, formulário progressivo de 7 etapas no
  molde do `PropertyWizard` (que já existe com steps), componentes do DS
  (TextField, Select, DatePicker, Checkbox), mobile first 375px, autosave com
  indicador, revisão final e confirmação.
- Shared: schemas Zod por seção (`financing-data/`), tipos e labels pt-BR.

### 7.4 Eventos e notificações

Tipos novos de `ProductEvent` (com `dedupeKey` para abertura única) e
`LeadActivity` nos marcos (enviada, respondida, aprovada). Notificação ao
corretor em: abriu pela primeira vez, enviou, reenviou, expirou sem envio.
Nada de renda ou CPF em metadata de evento (convenção já vigente do AuditLog).

## 8. Migrations previstas

1. Enums + 4 tabelas (request, draft, submission, access_code).
2. Blindagem: RLS + revoke anon/authenticated (padrão das épicas anteriores).

Sem alteração em tabela existente na etapa 1. `Consent` ganha, numa migration
pequena, um campo `origin` opcional (corretor ou formulário público).

Como sempre: migrations rodam local; em produção viram script para a Rafaelle.

## 9. Ordem de implementação (fatias verticais)

```text
Fatia A  schema + shared + serviço de transições + testes de isolamento
         (Tasks 2, 3 e parte da 5)
Fatia B  configuração e envio pelo corretor + link wa.me + revogação/expiração
         (Tasks 5, 25)
Fatia C  OTP + sessão leve + página pública com a 1ª seção (dados pessoais)
         (Tasks 4, 6, 13 parcial)
Fatia D  demais seções + autosave/retomada + revisão + consentimento + envio
         (Tasks 7 a 17)
Fatia E  revisão do corretor + correção + aprovação + aplicar à ficha +
         pré-preencher Simulation (Tasks 18 a 21)
Fatia F  notificações, eventos, acompanhamento na ficha, e2e integrado,
         documentação (Tasks 22 a 24, 29, 30)
```

Cada fatia termina funcionando de ponta a ponta, com teste de dois corretores,
quatro estados de tela e verificação em 375px, como manda o CLAUDE.md.

## 10. O que esta análise NÃO cobre

- Compartilhamento automático com banco (fora por princípio da épica).
- Consulta de FGTS ou score (declaratório por definição).
- Multiorganização.
- Criptografia de campo (limitação consciente registrada na seção 3).
