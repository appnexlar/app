# 07: Jornada 2, experiência guiada e inteligente

Documento da camada de ativação e adoção da Nexlar, construída em julho de 2026. Substitui o conceito de onboarding tradicional por uma camada contínua que ensina o corretor durante o uso, no contexto certo, uma orientação por vez.

Este documento é a fonte da verdade das regras da Jornada 2. Quem for evoluir a camada guiada lê isto antes.

## 7.1 Princípio

A Nexlar não exige que o corretor aprenda o sistema antes de usá-lo. Ela ensina durante o uso: dentro da tela relacionada, quando a funcionalidade fica relevante, por ação real, com uma recomendação principal por vez, sem bloquear a navegação.

O comportamento inteligente desta fase é determinístico: regras sobre os dados e eventos que já existem. Não há IA generativa. A arquitetura fica pronta para recebê-la depois sem quebrar contrato.

## 7.2 Tradução do escopo para a realidade da Nexlar

O prompt original pressupunha Supabase Auth, `organization_id` e RLS de aplicação. A Nexlar não é assim. As decisões de tradução, todas registradas aqui para não se perderem:

- **Sem `organization_id`.** A Nexlar é single-user por corretor. O inquilino é o `broker_id`, sempre vindo do JWT. Todo isolamento e toda regra de negócio vivem na API, nunca em RLS de front. Isso atende GUI-07 e a seção de segurança no lugar onde a Nexlar já garante isolamento. Ver [[feedback-nexlar-regras-no-back]] e [[feedback-nexlar-seguranca]].
- **Sem Supabase Auth / supabase-js / RLS de aplicação.** Mantida a stack da Jornada 1: NestJS + Prisma, JWT próprio em cookie httpOnly, design system próprio.
- **Sem i18n nesta fase.** Interface em pt-BR direto, como o resto do produto. Internacionalização é dívida registrada, fatia própria quando houver um segundo idioma no horizonte.

## 7.3 Regras de negócio (GUI-01 a GUI-10)

- **GUI-01, Contextualidade.** Uma orientação só aparece se a condição da tela, entidade ou conta bater. Codificado na função `eligible(ctx)` de cada definição (`guidance-definitions.ts`), pura sobre o contexto.
- **GUI-02, Progressividade.** Funcionalidade avançada não aparece antes de ser relevante. A cadeia educacional segue a sequência natural do corretor (lead, preferências, imóvel, envio).
- **GUI-03, Não repetição.** Orientação dispensada ou concluída não reaparece sem justificativa. Ver política de reapresentação (7.5).
- **GUI-04, Aprendizado por ação.** Uma orientação só vira `completed` quando o evento real correspondente acontece. Ninguém marca à mão; o checklist também é derivado de eventos e dados reais.
- **GUI-05, Não bloqueio.** Orientação nunca trava o sistema. A recepção e o diagnóstico são puláveis; o checklist é minimizável. Exceção reservada para segurança, privacidade e pagamento (categoria crítica), que ainda não têm regras.
- **GUI-06, Persistência.** O progresso vive no banco (`guidance_progress`, `onboarding_profile`, `product_event`), então atravessa sessões, navegadores e dispositivos.
- **GUI-07, Isolamento.** Todo progresso e contexto é isolado por `broker_id` do token. Coberto por teste e2e de dois corretores.
- **GUI-08, Priorização.** Crítica antes de operacional antes de educacional. Codificado no `GuidanceEngine.rank`. Uma educacional nunca substitui visualmente uma pendência de maior categoria.
- **GUI-09, Expiração.** Orientação que perdeu relevância vira `expired`. Aplicado às educacionais que o corretor já viu e que deixaram de ser elegíveis sem conclusão. As operacionais são recorrentes e ficam de fora da expiração de propósito, para poderem voltar quando a pendência ressurgir.
- **GUI-10, Transparência.** Cada recomendação carrega `sourceRule`, a regra que a gerou, para o corretor entender por que ela aparece.

## 7.4 Catálogo de eventos e idempotência

Todo evento de uso vira uma linha imutável em `product_event`, o registro central (§9 do prompt). O tipo é validado contra a lista `PRODUCT_EVENTS` do pacote `shared`: tipo fora do catálogo é recusado.

Idempotência (§27): eventos de "primeira vez" (`FIRST_*`, `PROFILE_COMPLETED`, diagnóstico) gravam um `dedupeKey` igual ao próprio tipo. O índice único `(broker_id, dedupe_key)` garante que o marco conta uma vez só, mesmo recebendo o evento várias vezes. Eventos repetíveis (`GUIDANCE_SHOWN`) deixam `dedupeKey` nulo e repetem à vontade.

Privacidade (§20, LGPD): o evento guarda só referências (`entity_type`, `entity_id`) e metadados mínimos. Nunca CPF, renda, nome de cliente ou conteúdo sensível. O campo `source` (ui, api, system) separa o que o corretor fez do que o sistema deduziu, base para separar analytics de operação.

## 7.5 Prioridade e política de reapresentação

Três categorias, em ordem obrigatória: **crítica, operacional, educacional**. Dentro da categoria, a `priority` maior vence.

Reapresentação depois de dispensar (§16):
- **educacional** (`nunca_reapresentar`): fechou, não volta sozinha;
- **operacional** (`reapresentar_se_relevante`): volta após 3 dias se a pendência persistir; "fazer depois" volta no dia seguinte;
- **crítica** (`sempre`): insiste enquanto a condição existir.

## 7.6 Limitações conhecidas (honestas)

- **Agenda / Google Calendar.** Não existe modelo de disponibilidade nem sync do Google ainda. O evento `CALENDAR_CONFIGURED` não é detectável, então "configurar agenda" fica como educacional dispensável e o item do checklist aparece como "em breve". O gancho está pronto para quando a feature existir. Ver [[nexlar-agenda]].
- **Categoria crítica sem regras.** O arcabouço ranqueia crítica primeiro, mas não há regras porque as fontes (conflito de agenda, pagamento, falha de sync) ainda não existem no sistema. Não foi criada UI morta para elas.
- **KPIs do dashboard ainda mock.** A Jornada 2 tornou real a camada de orientação; os números do funil no dashboard seguem mock até existir o módulo `dashboard` da API. São coisas separadas.
- **Descoberta progressiva parcial (§15).** As regras existentes já são progressivas (aparecem quando relevantes). Gatilhos mais finos (templates após mensagens repetidas, tags com volume de leads) dependem de dados que ainda não são coletados.

## 7.7 Relatório de autoauditoria

### Requisitos atendidos

- Acesso ao sistema sem onboarding longo; recepção de primeiro acesso curta; diagnóstico opcional e pulável.
- Dashboard adaptativo com recomendação contextual; estados vazios que explicam o valor (`SmartEmptyState`).
- Registro de eventos reais e idempotentes; checklist atualizado por ação real, nunca manual.
- Orientações com estado persistente (available, shown, dismissed, skipped, in_progress, completed, reopened, expired).
- Motor devolve uma recomendação principal por vez; crítica tem prioridade; dispensar, fazer depois e reabrir funcionam; conclusão por evento real; expiração por mudança de contexto.
- Progresso persistente entre sessões; isolamento por corretor provado em e2e; interface responsiva (desktop e mobile 375px); design system respeitado; erros tratados; fluxos existentes intactos.
- Central de ajuda contextual por rota, com arquitetura pronta para busca, vídeos e IA.
- Testes: engine puro (12 cenários da §26), e2e da fiação, idempotência, isolamento, expiração e ajuda. Suíte total em 91 verdes.

### Pendências

- KPIs reais do dashboard (módulo `dashboard` da API).
- Detecção de agenda configurada (depende do modelo de disponibilidade e do sync do Google).
- Regras da categoria crítica (dependem de fontes que ainda não existem).
- Observabilidade agregada: os eventos são a fundação e já separam operação de analytics, mas não há painel administrativo (não existe superfície de admin no MVP). Métricas por corretor são computáveis a partir de `product_event`.
- Emissão de alguns eventos ainda não ligada: `FIRST_LINK_VIEWED` (fluxo público), `FIRST_VISIT_SCHEDULED/COMPLETED` (agenda).
- i18n.

### Riscos identificados

- **Escrita em GET.** `GET /guidance` registra exibição, conclusão e expiração (grava no banco). É consciente, para o estado da orientação refletir o que foi visto, mas é um efeito colateral num verbo de leitura. Se o volume crescer, mover a marcação de "shown" para um POST explícito do front.
- **Custo por requisição.** Cada `GET /guidance` monta o contexto com várias contagens no banco. Hoje é barato; com carteiras grandes, considerar cache curto por corretor.
- **Oscilação operacional.** As regras operacionais recorrem de propósito; por isso ficam fora da expiração. Mudar isso sem cuidado as impediria de voltar.

### Sugestões de melhoria

- Ligar os eventos pendentes (visualização de link, visita) nas fatias dos módulos correspondentes.
- Quando existir o módulo `dashboard`, unificar a fonte de verdade dos números com o contexto do motor.
- Adicionar métricas por corretor (tempo até o primeiro lead, imóvel, compartilhamento) a partir de `product_event`, sem enviar dado pessoal para analytics externo.

Ver [[project-nexlar]], [[feedback-nexlar-ux-jornadas]] e [[feedback-nexlar-sistema-inteligente]].
