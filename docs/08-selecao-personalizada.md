# 08 — Seleção Personalizada de Imóveis

Jornada em que o corretor monta uma curadoria de imóveis para UMA lead e envia
um link exclusivo. A lead visualiza, reage (gostei / não combina / quero
visitar), pede informações e agenda visita em horário real da agenda. Tudo
volta para a Nexlar: timeline, funil, notificações, dashboard e eventos.

Princípio da épica: **a Nexlar recomenda, o corretor decide.** Nenhum imóvel é
enviado automaticamente.

A jornada tem duas portas de entrada:

1. **Pela lead** (ficha da lead → Criar seleção): pesquisa a carteira com as
   preferências dela já aplicadas.
2. **Pela carteira** (/imoveis → Selecionar): o corretor marca imóveis, toca
   em "Enviar para lead" e escolhe a pessoa; a seleção nasce rascunho já com
   os itens na ordem de marcação (`POST /selections` com `propertyIds`, máx.
   30, validação em bloco: arquivado ou imóvel alheio recusa tudo antes de
   criar). As duas portas caem no mesmo montador.

## Arquitetura

Mesmo modelo do envio rápido (`property_selection` + `selection_item`),
evoluído. Módulos:

- `apps/api/src/sharing/` — dono de `property_selection`:
  - `selections.service.ts` — máquina de estados + itens (lado do corretor)
  - `selection-candidates.service.ts` — pesquisa da carteira com contexto
  - `selection-compatibility.ts` — regras determinísticas de compatibilidade
  - `selection-public.service.ts` — página da lead, respostas e agendamento
  - `lead-stage.ts` — regra única de avanço automático do funil
- `apps/api/src/agenda/visit-availability.service.ts` + `visit-slots.ts` —
  disponibilidade do corretor e cálculo puro de slots
- `apps/api/src/leads/lead-preferences.service.ts` — preferências estruturadas
- `apps/api/src/public-page/property-public-view.ts` — montadores puros da
  visão pública de um imóvel, compartilhados com a vitrine
- Front: `apps/web/src/features/selections/` (montador, prévia, página da
  lead, folha de agendamento) e `agenda/VisitAvailabilitySection.tsx`

## Modelos (migrations `20260725120000` e `20260726130000`)

- `property_selection`: `status` (`rascunho|ativa|expirada|revogada|arquivada`),
  `expires_in_days`, `activated_at`, `archived_at` + os campos herdados
  (token, message, viewCount, sentAt, viewedAt, revokedAt, expiresAt)
- `selection_item`: `highlight` (máx. 3 por seleção), `broker_note`, `origin`
  (`preferencia|manual`), `compatibility` (`alta|media|baixa|fora_do_perfil`),
  `response_reason`, unicidade `(selection_id, property_id)`
- `lead_preference` (RLS): finalidade, tipos, cidades, bairros, faixa de
  preço, quartos/banheiros/vagas mínimos, metragem, mobiliado, comodidades,
  restrições. Uma por lead; salvar substitui o conjunto
- `visit_availability` (RLS): janelas semanais em Json validado, duração do
  slot (30/45/60/90), antecedência mínima, horizonte
- `agenda_event.visit_id`: evento de visita aponta o registro de `visit`

## Estados da seleção

```
rascunho -> ativa | arquivada
ativa    -> expirada | revogada | arquivada
expirada -> arquivada
revogada -> arquivada
```

- Transição é endpoint próprio; o front nunca escreve status. Fora do mapa: 409.
- Ativar exige >= 1 imóvel e prazo (7/15/30 dias). `expiresAt` = ativação +
  prazo, calculado no servidor. Editar nunca renova o prazo.
- Expiração é avaliada sob demanda (sem job): qualquer leitura que encontre
  ativa vencida persiste `expirada`.
- "Visualizada" não é estado: vive em `viewedAt`/`viewCount`.
- Envio rápido legado: continua criando seleção de 1 item já `ativa`; o
  reenvio de link revogado reativa (regra explícita de reabertura, só nele).

## Compatibilidade (regras, não porcentagem)

`selection-compatibility.ts`. Cada critério que a preferência define é
avaliado; não preenchido não conta. `fora_do_perfil` = finalidade errada ou
preço > teto + 20%. `alta` = todos os critérios atendem. `media` = preço ok e
metade dos demais. `baixa` = o resto. O veredito devolve `atende` e
`ressalvas` em texto, exibidos no card. A compatibilidade é fotografada no
item ao incluir.

## Token e privacidade

- 16 bytes aleatórios base64url (22 caracteres), único, gerado na criação.
  Link curto para o WhatsApp: `/s/:token`. O caminho antigo `/selecao/:token`
  segue aceito para links que já circularam (seleções antigas têm token de 32
  caracteres; ambos os tamanhos continuam válidos, a busca é pelo valor).
- Página pública sai com: primeiro nome da lead, mensagem, itens e corretor
  público (nome, WhatsApp, imobiliária, selo CRECI verificado). Nunca: nome
  completo, telefone/e-mail da lead, ids internos de imóvel (usa `code` e o
  id do item), notas internas, origem, comissão, endereço além do
  `addressDisplay`.
- Indisponível é sempre genérico (`expirado|revogado|indisponivel`); rascunho
  nunca circulou, então nem o corretor sai na resposta.
- Mídias servidas por rota validada por posse do token
  (`/api/public/selecoes/:token/media/:id`); imóvel fora de oferta não derruba
  as fotos dos demais.
- Páginas por token levam `noindex, nofollow`.
- Rate limit por IP em todas as rotas públicas (página 120/5min, ações
  30/10min, informações/visita 10/10min, slots 60/10min, fotos 600/5min).
- Exclusão de lead: cascata apaga seleções, itens e preferências.

## Endpoints

Autenticados (broker do token JWT, sempre):
- `POST /selections` · `GET /selections/:id` · `PATCH /selections/:id`
- `GET /selections/:id/candidates` (busca, filtros, flags, compatibilidade)
- `POST/PATCH/DELETE /selections/:id/items[...]` + `/items/reorder`
- `POST /selections/:id/{activate|revoke|archive}`
- `GET /selections/:id/preview` (prévia fiel, mídias pela rota autenticada)
- `GET /leads/:id/selections` · `GET|PUT /leads/:id/preferences`
- `GET|PUT /agenda/visit-availability`

Públicos (por token, `@Public` + rate limit):
- `GET /public/selecoes/:token` · `GET .../itens/:itemId` · `GET .../media/:id`
- `POST .../itens/:itemId/resposta` (`tenho_interesse|talvez|sem_interesse`
  com motivo opcional, `visualizado` = desfazer; repetição é no-op)
- `POST .../itens/:itemId/informacoes` (4 tipos)
- `POST .../itens/:itemId/visita` (solicitação, fallback)
- `GET .../itens/:itemId/slots` · `POST .../agendar` · `POST .../visita/cancelar`

## Agendamento de visitas

- Fuso fixo `America/Sao_Paulo` (UTC-3, sem horário de verão desde 2019),
  documentado em `visit-slots.ts`; é o único lugar a mudar se um dia houver
  corretor em outro fuso.
- Slot válido = cabe na janela, respeita antecedência e não encosta em nada
  ocupado (eventos bloqueantes da agenda + visitas, inclusive as manuais).
- Agendar revalida o slot DENTRO da transação com
  `pg_advisory_xact_lock(hashtext(brokerId))`: sem double booking. Horário
  fora das janelas é recusado mesmo "livre".
- Agendou: cria `visit` (agendada) + `agenda_event` (visita/confirmada,
  vinculados por `visit_id`), item vira `quero_visitar`, funil vai a
  `visita_agendada`, timeline + notificação.
- Cancelou (lead): visita `cancelada`, evento cancelado, item volta a
  `tenho_interesse` (interesse permanece), slot liberado, notificação.
- Sem janelas configuradas: fallback de solicitação. Nunca inventamos horário.

## Notificações do corretor

`selecao_aberta` (só a primeira), `selecao_gostou`, `selecao_descartou`,
`selecao_todos_descartados` (quando a última resposta descarta tudo),
`selecao_informacoes`, `selecao_visita` (solicitada), `selecao_visita_agendada`,
`selecao_visita_cancelada`.

## Eventos de produto

Catálogo em `packages/shared/src/guidance/dto.ts`:
`SELECTION_{CREATED|ACTIVATED|SENT|OPENED|EXPIRED|REVOKED}`,
`SELECTION_PROPERTY_{LIKED|UNLIKED|DISMISSED}`,
`SELECTION_{INFORMATION_REQUESTED|VISIT_REQUESTED|VISIT_SCHEDULED|VISIT_CANCELLED}`.
Deduplicação por `dedupeKey` quando o evento só faz sentido uma vez por
entidade. Marcos da Jornada 2 emitidos junto: `CALENDAR_CONFIGURED`,
`FIRST_LINK_VIEWED`, `FIRST_INTEREST_RECEIVED`, `FIRST_VISIT_SCHEDULED`.
Nenhum dado pessoal nos eventos, só referências.

## Testes

- `selections.e2e.spec.ts` — máquina de estados, itens, prazo, preferências,
  candidatos, compatibilidade, isolamento (10)
- `selection-public.e2e.spec.ts` — página da lead, respostas, indisponíveis,
  prévia, minimização de dados (6)
- `visit-booking.e2e.spec.ts` — disponibilidade, slots, conflito,
  concorrência, cancelamento, fallback, isolamento (5)
- `selection-journey.e2e.spec.ts` — o fluxo completo com rastro (1)

## Revisão de segurança e LGPD (26 jul 2026)

Verificado: token imprevisível e único; motivo interno nunca vaza; broker_id
sempre do JWT; isolamento coberto por teste de dois corretores; transições só
no servidor; respostas por whitelist zod; idempotência de cliques; trava de
concorrência no agendamento; rate limit em toda rota pública; mídias por
posse; XSS coberto pelo escape do React (nada de HTML vindo de texto do
usuário); minimização (primeiro nome; nada de telefone/e-mail/ids da lead na
página; eventos sem dados pessoais); noindex nas páginas por token; cascata de
exclusão da lead cobre a jornada inteira; RLS nas tabelas novas.

Riscos residuais aceitos e conhecidos:
1. Quem tiver o link vê a seleção (é a natureza do produto). Mitigação: prazo
   curto, revogação imediata, token forte.
2. Rate limit é em memória por instância: em múltiplas instâncias o teto
   efetivo multiplica. Hoje a API roda em instância única (Railway).
3. Notificação de "expiração próxima" não existe (exigiria job); a expiração
   em si é garantida sob demanda.
4. `SELECTION_EXPIRED` não é emitido quando a expiração acontece pelo
   `updateMany` da listagem da ficha (só nas leituras individuais); métrica
   pode subcontar, estado nunca fica errado.

## Limitações conhecidas / próximos passos

- Google Calendar ainda não sincroniza (colunas prontas; fatia futura da
  agenda). O slot considera só a agenda Nexlar.
- Remarcar = cancelar + agendar de novo (dois registros; histórico íntegro).
- Miniaturas usam a foto original (sem pipeline de thumbnails).
- Sem SEO/Open Graph no link (decisão: páginas por token não indexam mesmo).
