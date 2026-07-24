# 02: Modelo de dados, funil e telas

Este documento define as entidades do core, seus campos, as relações e o funil. Os nomes de tabela e coluna estão em inglês (snake_case) por convenção de banco; os rótulos de interface estão em português no documento de jornadas.

## 2.1 Entidades e relações (visão geral)

```
broker (corretor)
  ├─ 1:N lead
  │        ├─ 1:1 lead_preferences (perfil do imóvel procurado)
  │        ├─ 1:N property_selection (seleção de imóveis preparada para a lead)
  │        │        └─ 1:N selection_item (cada imóvel enviado, com a resposta da lead)
  │        │                 └─ N:1 property
  │        ├─ 1:N visit (visitas; origem opcional numa seleção)
  │        │        ├─ N:1 property (imóvel principal da visita)
  │        │        └─ N:N property (imóveis apresentados) via visit_property
  │        ├─ 0:1 conversion (registro consciente de virar cliente)
  │        ├─ 1:N lead_activity (histórico/timeline)
  │        ├─ 1:N task (próxima ação / follow-up)
  │        ├─ 1:N document (documentos por etapa; só após conversão)
  │        └─ 1:N simulation (registro de simulação; só após conversão)
  └─ 1:N property (imóveis do corretor)
```

Regras gerais que valem para todas as tabelas de negócio: toda linha tem `id` (uuid), `broker_id` (uuid, dono), `created_at` e `updated_at` (timestamps). O `broker_id` é preenchido pela API a partir do usuário autenticado (token JWT), nunca vindo do cliente, e é a base da autorização por dono descrita em `docs/06`.

**Lead e cliente são a mesma pessoa em fases diferentes.** Não há tabela separada de cliente. A pessoa nasce como lead (prospecção, avaliação de imóveis, visitas) e vira cliente por uma ação consciente de conversão (ver 2.12 e 2.16). A conversão liga o marcador `is_client` e a data `converted_at` no próprio lead e cria um registro em `conversion`; ela nunca acontece por simples mudança de `status`. Toda a timeline e o histórico são preservados na conversão.

**Imóvel e lead têm relação muitos-para-muitos, registrada em cada envio.** Um imóvel pode ser enviado para várias leads e uma lead pode receber vários imóveis, sem nunca duplicar o cadastro do imóvel. Cada envio é um registro próprio. O modelo é unificado (decisão de 20 jul 2026): **um envio é uma `property_selection`; cada imóvel dentro dele é um `selection_item`**. Compartilhar um único imóvel a partir da ficha do imóvel é apenas uma seleção com um item. Não existe tabela `property_shares` separada: a seleção com um item é o compartilhamento. O link público, o token, o status do link e as visualizações vivem na seleção; a resposta e o pedido de visita de cada imóvel vivem no item. Assim `property` ↔ `lead` é N:N através de `selection_item`.

## 2.2 broker (corretor)

Perfil do corretor. É também a conta de autenticação: guarda as credenciais de login.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| password_hash | text | Argon2id, nunca exposto pela API |
| full_name | text | obrigatório |
| email | text | obrigatório, único |
| phone | text | opcional |
| creci | text | opcional no MVP (validação fica para fase 2) |
| agency_name | text | opcional (nome da imobiliária, se vinculado) |
| avatar_url | text | opcional |
| created_at / updated_at | timestamptz | |

## 2.3 lead

Entidade central. É a pessoa/contato que o corretor está atendendo.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| full_name | text | obrigatório |
| whatsapp | text | obrigatório, formato E.164 recomendado |
| email | text | opcional |
| cpf | text | opcional no primeiro cadastro, validado quando preenchido |
| source | enum `lead_source` | origem: instagram, tiktok, whatsapp, indicacao, site, outro |
| intent | enum `lead_intent` | comprar, financiar, investir, vender, pesquisar |
| audience | enum `lead_audience` | brasil, exterior |
| region | text | cidade/bairro de interesse, opcional |
| budget_min | numeric | opcional |
| budget_max | numeric | opcional |
| status | enum `lead_status` | ver 2.9, default `novo` |
| is_client | boolean | default false; só a conversão liga (ver 2.16) |
| converted_at | timestamptz | data da conversão; nulo enquanto for lead |
| notes | text | observações livres |
| last_activity_at | timestamptz | última atividade de qualquer tipo (usada em "última atividade" e alertas de parado) |
| last_contact_at | timestamptz | atualizado a cada atividade de contato |
| next_action_at | timestamptz | derivado da task aberta mais próxima (ver 2.5) |
| lost_reason | text | preenchido quando status = perdida |
| reactivate_at | date | preenchido quando status = reativar_futuro |
| created_at / updated_at | timestamptz | |

Índices úteis: por `broker_id`, por `status`, por `is_client`, por `next_action_at`, por `last_contact_at`.

**`status` e `is_client`/`converted_at` são independentes.** Mudar o status (por exemplo `novo → em_atendimento`) nunca altera `is_client`, `converted_at`, o tipo da pessoa nem o acesso à área sensível. Só a rota de conversão (`POST /leads/:id/convert`, ver 2.16 e `docs/03`) faz isso.

## 2.4 lead_activity (timeline)

Histórico imutável do relacionamento. Cada evento relevante vira uma linha. É o que dá ao corretor o histórico que hoje se perde no WhatsApp.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | |
| type | enum `activity_type` | nota, mudanca_status, contato, preferencias, selecao, visita, documento, simulacao, conversao, tarefa_criada, tarefa_concluida |
| description | text | texto do evento |
| metadata | jsonb | dados extras (ex.: status anterior e novo, id da seleção, id do imóvel) |
| created_at | timestamptz | |

Atividades são geradas pelo sistema e também manualmente (nota de conversa). Eventos que a timeline registra automaticamente ao longo da jornada da lead: lead criada, dados atualizados, preferências registradas, seleção criada, imóveis adicionados à seleção, seleção enviada, link visualizado, resposta da lead registrada, visita solicitada, visita criada, visita confirmada, visita realizada, feedback registrado, imóvel prioritário definido, tarefa criada, status alterado e lead convertida em cliente. A timeline é histórico cronológico: apoia a ficha, não é a estrutura principal dela (ver `docs/03`).

## 2.5 agenda_event (agenda unificada: tarefa, visita, compromisso, bloqueio)

A agenda do corretor tem um único registro para todos os tipos de evento. Ele substitui a antiga tabela `task`: uma tarefa é apenas um `agenda_event` de `type = tarefa`. O Nexlar é a fonte principal; os campos `google_*` ficam preparados para a integração com o Google Calendar (fatia seguinte, ainda inertes).

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono (isolamento pela API) |
| type | enum `agenda_event_type` | tarefa, visita, compromisso, bloqueio, google_ocupado |
| lead_id | uuid? | opcional (tarefa e visita podem vincular lead) |
| property_id | uuid? | opcional (visita vincula imóvel) |
| title | text | obrigatório |
| description | text? | observação |
| location | text? | local / endereço |
| start_at | timestamptz | obrigatório, sempre em UTC |
| end_at | timestamptz? | nulo em tarefa sem duração |
| all_day | boolean | tarefa sem horário = dia inteiro |
| status | enum `agenda_event_status` | tarefa: pendente/concluida/cancelada; compromisso/bloqueio: agendado; visita: solicitada..aguardando_feedback |
| task_kind | text? | natureza da tarefa (primeiro_contato, retorno, ...) |
| reminder_minutes | int? | lembrete |
| recurrence | text? | bloqueio recorrente (futuro) |
| completed_at | timestamptz? | preenchido ao concluir/realizar |
| source | enum `agenda_event_source` | nexlar (padrão) ou google |
| sync_status | enum `agenda_sync_status` | nao_sincronizado, pendente, sincronizado, alterado, erro, desconectado |
| google_calendar_id / google_event_id / google_updated_at / last_sync_at | | preparados para a integração Google |
| created_at / updated_at | timestamptz | |

Regras de negócio (na API): vínculo de lead/imóvel precisa pertencer ao corretor; eventos com horário (visita, compromisso, bloqueio, ocupado do Google) que se sobrepõem geram conflito (409) a menos que o corretor confirme (`force`).

O campo `next_action_at` do lead reflete o `agenda_event` aberto (tarefa ou visita não encerrada) com `start_at` mais próximo. Sem evento aberto, o lead entra nos alertas de "sem próxima ação". Criar, editar, concluir ou excluir um evento vinculado recalcula esse campo.

**Sub-fatia A (entregue):** tarefa e compromisso pela tela `/agenda` (FullCalendar), resumo operacional, filtros, conflito de horário. **Próximas fatias:** visita e bloqueio pela tela + drag-and-drop; integração individual com Google Calendar (OAuth no back, push Nexlar→Google, free/busy); horários de atendimento para o agendamento público futuro.

## 2.6 document

Documento do cliente, organizado por etapa. Ver as duas etapas de coleta em 2.10.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | |
| doc_type | enum `document_type` | ver 2.10 (comprovante_endereco, contracheque, ir, doc_dependente, doc_subsidio, doc_exterior, contrato, outro) |
| stage | enum `document_stage` | etapa_1_registro, etapa_2_analise |
| file_path | text | chave do objeto no bucket S3/R2 (`broker_id/lead_id/uuid`) |
| file_name | text | nome original |
| status | enum `document_status` | pendente, recebido, validado, recusado |
| notes | text | opcional (ex.: motivo da recusa) |
| created_at / updated_at | timestamptz | |

Um documento pode existir como item de checklist sem arquivo (status pendente, sem `file_path`) e receber o arquivo depois. Isso permite mostrar o que falta.

## 2.7 property (imóvel) e visit (visita)

Imóveis são cadastro leve no MVP, só o suficiente para registrar o que foi apresentado numa visita. Não é um portal de imóveis.

**property**

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| title | text | obrigatório (ex.: "Apto 2 quartos, Jardins") |
| address | text | opcional |
| price | numeric | opcional |
| reference | text | código/referência externa, opcional |
| notes | text | opcional |
| created_at / updated_at | timestamptz | |

**visit**

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | |
| property_id | uuid | imóvel principal da visita, opcional |
| selection_id | uuid | seleção de origem, quando a visita nasceu de um item enviado; opcional |
| request_origin | enum `visit_request_origin` | corretor, lead. `lead` quando a visita nasce de "Quero visitar" na página pública (2.14b); `corretor` quando o próprio corretor cria |
| selection_item_id | uuid | item que originou a visita, quando veio de um compartilhamento; opcional |
| scheduled_at | timestamptz | data/hora da visita |
| status | enum `visit_status` | solicitada, aguardando_confirmacao, confirmada, realizada, remarcada, cancelada, nao_compareceu, aguardando_feedback |
| feedback | text | resumo livre do feedback |
| feedback_interest | enum `interest_level` | alto, medio, baixo, nenhum; preenchido no feedback estruturado |
| feedback_positives | text | pontos positivos |
| feedback_negatives | text | pontos negativos |
| wants_to_advance | boolean | a lead quer avançar com este imóvel |
| wants_other_properties | boolean | a lead quer ver outros imóveis |
| next_action | text | próxima ação combinada |
| created_at / updated_at | timestamptz | |

**visit_property** (N:N entre visita e imóveis apresentados, para quando mais de um imóvel é visto na mesma saída; o imóvel principal fica em `visit.property_id`)

| Campo | Tipo |
|---|---|
| visit_id | uuid |
| property_id | uuid |

Marcar uma visita como realizada e registrar o feedback não converte a lead em cliente. Depois do feedback, a ficha pergunta se a lead quer avançar (ver `docs/03`), e só a ação explícita de conversão muda o tipo da pessoa.

## 2.8 simulation (registro de simulação bancária)

No MVP a simulação é registro manual do resultado, com atalho para o simulador da Caixa. Não há integração automática.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | |
| bank | text | banco/parceiro (default "Caixa") |
| property_value | numeric | valor do imóvel |
| down_payment | numeric | entrada |
| financed_amount | numeric | valor financiado |
| term_months | integer | prazo em meses |
| monthly_installment | numeric | parcela estimada |
| subsidy | numeric | subsídio, opcional |
| status | enum `simulation_status` | pendente, realizada |
| result_notes | text | observações do resultado |
| simulated_at | date | quando foi feita |
| created_at / updated_at | timestamptz | |

## 2.9 Funil e status da lead (`lead_status`)

Os status representam a evolução geral da jornada da lead, do primeiro contato até a conversão. O funil na interface é um kanban com colunas agrupadas para não virar uma parede de colunas no celular. Cada status pertence a um grupo visual.

| Status | Rótulo | Grupo (coluna do kanban) |
|---|---|---|
| novo | Novo lead | Novos |
| em_atendimento | Em atendimento | Atendimento |
| preferencias_definidas | Preferências definidas | Atendimento |
| selecao_em_preparacao | Seleção em preparação | Imóveis enviados |
| imoveis_enviados | Imóveis enviados | Imóveis enviados |
| avaliando_imoveis | Avaliando imóveis | Imóveis enviados |
| visita_solicitada | Visita solicitada | Visitas |
| visita_agendada | Visita agendada | Visitas |
| visitando_imoveis | Visitando imóveis | Visitas |
| imovel_prioritario | Imóvel prioritário | Visitas |
| aguardando_decisao | Aguardando decisão | Visitas |
| convertida_em_cliente | Convertida em cliente | Clientes |
| perdida | Perdida | Encerradas (fora do quadro) |
| reativar_futuro | Reativar no futuro | Encerradas (fora do quadro) |

O quadro tem cinco colunas, na ordem: Novos, Atendimento, Imóveis enviados, Visitas, Clientes. O funil mostra só o pipeline vivo: perdida e reativar não são colunas, são ações com regra (motivo/data) acessíveis pelo seletor de etapa; as leads encerradas aparecem num atalho discreto abaixo do quadro. Os identificadores no código (`FunnelGroup` em `packages/shared`) são `novos`, `atendimento`, `imoveis_enviados`, `visitas`, `clientes` e `encerradas`. Ao soltar um card num grupo com mais de um status, a lead aterrissa no status de entrada do grupo (ex.: soltar em Visitas marca `visita_solicitada`). O card mantém a etiqueta do status específico.

Transições: o corretor pode mover uma lead entre os status manualmente (arrastar no kanban ou trocar na ficha). Além disso, eventos comerciais movem a lead automaticamente, sempre registrando na timeline como mudança automática: enviar um imóvel move para `imoveis_enviados`; a lead abrir o link público move para `avaliando_imoveis`; registrar resposta move para `avaliando_imoveis` (ou `visita_solicitada` quando a resposta é "quero visitar"); marcar um imóvel como prioritário move para `imovel_prioritario`. A automação só anda para a frente na jornada (nunca rebaixa uma lead que já está adiante) e nunca mexe em lead perdida, a reativar ou convertida em cliente: sair dessas etapas é sempre decisão do corretor. Toda mudança de status gera uma `lead_activity` do tipo `mudanca_status`.

**`convertida_em_cliente` é a exceção: não é uma opção comum de mudança de status.** Ele só pode ser aplicado pela ação de conversão (2.16 e `docs/03`), que também liga `is_client` e `converted_at`. O seletor de status e o arrastar do kanban não oferecem esse valor como destino livre.

Regras de status especiais: ao marcar `perdida`, pedir `lost_reason`. Ao marcar `reativar_futuro`, pedir `reactivate_at` (data futura) e criar automaticamente uma `task` com `due_at` nessa data.

## 2.10 Coleta de dados em duas etapas

Para reduzir atrito, os dados entram em dois momentos. Isso está refletido no campo `stage` dos documentos e na tela de cadastro.

**Etapa 1, registro inicial.** No primeiro contato: nome completo, WhatsApp, CPF quando necessário, origem, interesse, cidade/bairro, faixa de valor e observações. Só nome e WhatsApp são obrigatórios. Todo o resto é opcional para não travar o cadastro rápido.

**Etapa 2, análise e fechamento.** Quando o lead decide avançar (financiamento, proposta ou compra): comprovante de endereço, três últimos contracheques, imposto de renda, documentos de dependentes, documentos para subsídio, documentos específicos de cliente no exterior e anexos exigidos pelo banco. Esses são os `document_type` da etapa 2.

## 2.11 Inventário de telas (core)

| Tela | Função |
|---|---|
| Login / Cadastro do corretor | Autenticação e criação de conta |
| Dashboard | Métricas do mês e alertas de leads parados e tarefas do dia |
| Funil (Kanban) | Visão do funil por colunas, arrastar para mudar status |
| Lista de leads | Lista com busca e filtros (status, origem, interesse, público) |
| Cadastro rápido de lead | Formulário curto da etapa 1, alvo de trinta segundos |
| Ficha da lead | Página central da lead: cabeçalho, resumo, preferências, imóveis enviados, imóvel prioritário, visitas, tarefas e timeline. A timeline não é a área principal |
| Preferências da lead | Editar o perfil do imóvel procurado (seção da ficha) |
| Selecionar imóveis | Buscar e filtrar imóveis da carteira, escolher vários e salvar uma seleção para a lead |
| Enviar imóvel para uma lead | Fluxo em etapas na ficha do imóvel: escolher a lead, revisar o imóvel e a localização exibida, criar o compartilhamento e abrir o WhatsApp |
| Página pública do compartilhamento | `/compartilhamento/{token}`, sem login: imóvel com dados autorizados, respostas da lead e pedido de visita |
| Documentos do cliente | Checklist por etapa com upload e status (fase de cliente, após conversão) |
| Visitas | Criar visita, associar a um imóvel enviado, alterar status, registrar feedback |
| Simulação | Registrar resultado de simulação, atalho para o simulador da Caixa (fase de cliente) |
| Agenda / Tarefas | Todas as tarefas do corretor, foco no que vence hoje e no que está atrasado |
| Perfil do corretor | Dados do corretor e verificação de CRECI: número, UF, documento no bucket privado e `creci_status` (nao_enviado/pendente/aprovado/recusado) |

O detalhamento de cada tela e o passo a passo de uso estão em `docs/03-jornadas.md`. A rota da ficha é `/leads/:id` e o título é sempre **Ficha da lead** antes da conversão.

## 2.12 lead_preferences (perfil do imóvel procurado)

O que a lead procura. Separado do `lead` para não inchar a tabela central e porque é editado como um bloco próprio na ficha. Relação 1:1 com o lead.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | único (1:1) |
| purpose | enum `preference_purpose` | comprar, alugar, investir |
| category | text | categoria do imóvel (residencial, comercial, etc.) |
| property_type | text | tipo (apartamento, casa, terreno, etc.) |
| city | text | cidade |
| neighborhoods | text[] | bairros ou regiões |
| price_min | numeric | faixa mínima |
| price_max | numeric | faixa máxima |
| bedrooms_min | integer | quartos mínimos |
| bathrooms_min | integer | banheiros mínimos |
| parking_min | integer | vagas mínimas |
| area_min | numeric | área mínima |
| desired_features | text[] | características desejadas |
| rejected_features | text[] | características rejeitadas |
| accepts_condo | boolean | aceita imóvel em condomínio |
| needs_financing | boolean | precisa de financiamento |
| deadline | text | prazo para compra ou mudança |
| notes | text | observações |
| created_at / updated_at | timestamptz | |

Salvar preferências gera `lead_activity` do tipo `preferencias` e sugere o status `preferencias_definidas`. Uma ação futura ("usar preferências para buscar imóveis") vai pré-filtrar a seleção; nesta etapa a busca ainda é manual.

## 2.13 property_selection (envio / compartilhamento para uma lead)

Um envio de imóveis para uma lead. Também é o compartilhamento: um único imóvel enviado da ficha do imóvel é uma seleção com um item. Guarda o link público, o token e o rastreio de acesso. Uma lead pode ter várias seleções ao longo do tempo.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono; vem sempre do token autenticado, nunca do payload |
| lead_id | uuid | para quem foi enviado |
| status | enum `selection_status` | criada, enviada, visualizada, respondida, expirada, revogada, arquivada |
| message | text | mensagem enviada junto do link |
| public_token | text | token opaco, único e difícil de adivinhar; base da URL pública, não expõe ids internos |
| sent_at | timestamptz | quando foi enviada (registrada mesmo com envio manual pelo WhatsApp) |
| first_viewed_at | timestamptz | primeiro acesso ao link |
| last_access_at | timestamptz | último acesso ao link |
| view_count | integer | quantidade de visualizações, default 0 |
| resend_count | integer | quantas vezes o mesmo link foi reenviado, default 0 |
| expires_at | timestamptz | validade opcional do link |
| revoked_at | timestamptz | preenchido ao revogar o link |
| created_at / updated_at | timestamptz | |

Criar uma seleção gera `lead_activity` do tipo `selecao`. Enviar sugere o status `imoveis_enviados` na lead. Reenviar o mesmo link não cria outra seleção nem duplica o imóvel: atualiza `sent_at` e incrementa `resend_count`. Para um link novo, o corretor usa "Criar novo compartilhamento" (nova seleção). Revogar preenche `revoked_at`; a página pública passa a mostrar o aviso de link indisponível.

## 2.14 selection_item (imóvel dentro de um envio)

Cada imóvel enviado dentro de uma seleção, com a resposta daquela lead sobre aquele imóvel. É o registro que torna `property` ↔ `lead` N:N: o mesmo `property_id` aparece em itens de seleções de leads diferentes, cada um com sua própria resposta.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| selection_id | uuid | |
| property_id | uuid | mesmo cadastro reusado; nunca duplicado por envio |
| display_order | integer | ordem de exibição (`position`) |
| location_display | enum `location_display` | endereco_completo, sem_numero, bairro_cidade, aproximada; o corretor escolhe o que aparece no link |
| sent_at | timestamptz | data do envio |
| lead_response | enum `selection_response` | nao_visualizado (default), visualizado, tenho_interesse, talvez, sem_interesse, quero_visitar, visita_solicitada, visita_agendada, visitado, escolhido_para_avancar |
| responded_at | timestamptz | data da resposta |
| comment | text | comentário da lead |
| visit_requested_at | timestamptz | quando a lead pediu visita neste imóvel |
| is_priority | boolean | imóvel prioritário desta lead |
| created_at / updated_at | timestamptz | |

O `lead_response` é sempre mostrado por texto, não só por cor. A resposta é por item: Mariana responder "Tenho interesse" no imóvel A não altera a resposta de Carlos sobre o mesmo imóvel. A resposta pode vir da página pública (a lead responde) ou ser registrada manualmente pelo corretor. Marcar `is_priority` alimenta a seção "Imóvel prioritário" da ficha e não converte a lead.

## 2.14b Página pública do compartilhamento e segurança

A URL pública é `/compartilhamento/{public_token}` e abre sem login. O token identifica corretor, lead, seleção e imóveis sem expor ids previsíveis. A página registra automaticamente primeiro acesso (`first_viewed_at`), último acesso (`last_access_at`) e incrementa `view_count`; move o status da seleção para `visualizada` no primeiro acesso.

A página mostra só dados autorizados do imóvel: fotos e vídeos autorizados, valor, tipo, características, localização no nível escolhido em `location_display`, descrição, e o contato do corretor com botão de WhatsApp. **Nunca expõe** comissão, proprietário, instruções de chave, observações privadas, contatos internos, documentos internos nem dados sensíveis da lead.

A lead pode responder (Tenho interesse, Talvez, Não tenho interesse, Quero visitar) com comentário opcional, e pedir visita (data ou período e observação), o que cria/atualiza o `selection_item` e uma `visit` com `request_origin = lead` (ver 2.7). Links revogados (`revoked_at`) ou expirados (`expires_at`) mostram: "Este link não está mais disponível. Entre em contato com o corretor para receber uma nova seleção."

Isolamento: seleções, itens, respostas, visitas e mídias pertencem ao corretor autenticado. Um corretor não gera link de imóvel de outro, não envia para lead de outro, não vê respostas de outro e não acessa registros por manipulação de id. A rota pública valida pelo token e serve apenas o conteúdo daquela seleção.

## 2.15 property (campos completos)

O `property` da seção 2.7 é o cadastro leve do MVP. A carteira de imóveis do módulo de imóveis usa os campos completos (dados, fotos, vídeos, localização, valores, disponibilidade, origem, corretor dono do registro), já definidos no código do módulo de imóveis. A seleção e os itens referenciam esse mesmo `property`. Só imóveis disponíveis entram numa seleção.

## 2.16 conversion (lead vira cliente)

Registra a transformação consciente de lead em cliente. Existe no máximo uma conversão por lead (0:1).

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | único |
| converted_at | timestamptz | data da conversão |
| reason | enum `conversion_reason` | inicio_financiamento, solicitacao_documentos, analise_cadastral, preparacao_proposta, negociacao_formal, outro |
| property_id | uuid | imóvel relacionado, quando aplicável |
| next_step | text | próxima etapa combinada |
| consent | boolean | consentimento para coleta de dados adicionais (LGPD); obrigatório true |
| created_at | timestamptz | |

A conversão acontece por `POST /leads/:id/convert`. Efeitos: mantém o mesmo cadastro (não duplica a pessoa), preserva toda a timeline, liga `lead.is_client = true` e `lead.converted_at`, move `lead.status` para `convertida_em_cliente`, relaciona o imóvel escolhido, libera os campos e telas sensíveis (documentos, simulação, proposta), mantém a oportunidade ativa e registra `lead_activity` do tipo `conversao`. Uma mudança comum de status nunca produz esse efeito.

**Implementado (fatia 1, jul 2026).** O enum `conversion_reason` inclui também `processo_locacao`; `next_step` é o enum `conversion_next_step` (coletar_dados, solicitar_documentos, registrar_simulacao, preparar_proposta, iniciar_analise_cadastral, iniciar_negociacao); e a conversão guarda a finalidade em `purpose` (enum `client_purpose`: compra, locacao). Tudo em uma transação (sem conversão parcial), com registro de consentimento (2.17) e auditoria (2.18).

**Separação de experiência (decisão jul 2026).** No banco é a mesma pessoa (um só registro), mas nas telas as fases são separadas: quem converteu SAI da lista de Leads (`GET /leads` filtra `is_client = false`), o link antigo `/leads/:id` redireciona para `/clientes/:id`, e no funil a coluna Clientes é um cartão-atalho com contagem que abre a área Clientes (o quadro lista só o pipeline vivo). O cadastro maior do cliente entra pelas tabelas de perfil (2.19), nunca inflando a tabela `lead`.

## 2.17 consent (consentimento LGPD)

Registro do consentimento apresentado antes da coleta de dados adicionais. Não é um checkbox genérico: guarda a finalidade, a versão do texto e a data. 1:N por lead.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | dono |
| lead_id | uuid | |
| purpose | text | finalidade da coleta (ex.: coleta_dados_adicionais) |
| text_version | text | versão do aviso aceito |
| accepted_at | timestamptz | data/hora do aceite |
| created_at | timestamptz | |

## 2.18 audit_log (trilha de auditoria)

Ações sensíveis (conversão, alterações de dados pessoais/financeiros, consentimento, exclusão). NUNCA guarda conteúdo sensível (CPF, renda, documento, token): só quem, quando, o quê e sobre qual entidade.

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | |
| broker_id | uuid | responsável |
| action | text | ex.: `lead_convertida` |
| entity_type | text | ex.: `lead` |
| entity_id | uuid | entidade afetada |
| metadata | jsonb | metadados não sensíveis |
| created_at | timestamptz | |

## 2.19 perfil de cliente e dados financeiros

Os dados pessoais sensíveis não moram na tabela `lead`.

**Implementado (fatia 2, jul 2026):**
- `client_profile` (0:1 com lead): cpf (11 dígitos normalizados), rg, birth_date, marital_status (enum), nationality, residence_country, cep (8 dígitos), street, address_number, complement, neighborhood, city, state (UF), alt_phone. NENHUM campo obrigatório (coleta progressiva); valida-se o que for preenchido. Editado por `PATCH /clients/:id/profile` (upsert).
- `client_negotiation` (0:1): estado ATUAL da negociação (a conversão 2.16 é o registro histórico): property_value, interest_date, expected_term, payment_method (enum a_vista/financiamento/fgts_mais_financiamento/permuta/outro), needs_financing, notes. `PATCH /clients/:id/negotiation`.
- Cada PATCH audita em `audit_log` (`dados_pessoais_alterados` / `negociacao_alterada`) só com os NOMES dos campos, nunca valores.

**Implementado (fatia 3, jul 2026):**
- `client_financial` (0:1, sensível): income_type (enum), monthly_income, occupation, activity_time, down_payment, has_fgts, preferred_bank, has_income_composition, dependents_count, notes. NUNCA em listas, Dashboard, URLs ou logs. `PATCH /clients/:id/financial`.
- `client_participant` (1:N): relation (enum conjuge/comprador_conjunto/locatario_conjunto/fiador/dependente/procurador/outro), full_name, cpf, phone, email, notes. `POST/PATCH/DELETE /clients/:id/participants[/:participantId]`. CPF mascarado (`***.***.***-12`) na exibição.
- `data_deletion_request` (LGPD): a ação "Solicitar exclusão de dados" REGISTRA a solicitação (status solicitada/em_analise/concluida/negada), não apaga: dados sob retenção obrigatória exigem análise. `POST /clients/:id/deletion-request`. Estrutura preparada para exclusão/anonimização/retenção nas próximas etapas.
- Toda alteração sensível é auditada em `audit_log` só com nomes de campos (dados_financeiros_alterados, participante_adicionado, exclusao_solicitada), nunca valores.

**Pendente (próximas etapas):** exclusão/anonimização efetiva com política de retenção, exportação de dados (portabilidade LGPD) e criptografia em repouso de campos sensíveis.

## 2.20 Jornada 2: experiência guiada (product_event, guidance_progress, onboarding_profile)

Camada transversal de ativação e adoção (ver `docs/07`). Três tabelas, todas isoladas por `broker_id` (a Nexlar é single-user por corretor; não há `organization_id`). Migração `20260724135826_jornada2_fundacao_guiada`, com RLS ligada nas três, como no resto do banco.

- `product_event` (log append-only, imutável): broker_id, type (String, validada no serviço contra o catálogo do `shared`, não enum do Prisma porque o catálogo cresce), entity_type, entity_id, source (ui/api/system), dedupe_key, metadata (Json), created_at. Índice único `(broker_id, dedupe_key)` garante a idempotência dos marcos de "primeira vez". NUNCA guarda dado sensível: só referências e metadados mínimos.
- `guidance_progress` (estado por orientação, 1 por chave por corretor): broker_id, guidance_key (casa com o registry em código), status (enum available/shown/dismissed/skipped/in_progress/completed/reopened/expired), show_count, timestamps (first_shown_at, last_shown_at, dismissed_at, completed_at, reopened_at, expires_at), metadata. Único por `(broker_id, guidance_key)`.
- `onboarding_profile` (1:1 com broker): respostas do diagnóstico inicial (work_mode, business_focus, has_existing_leads, has_existing_properties, calendar_provider), diagnosis_completed, diagnosis_skipped, first_access_at. Tudo opcional: o diagnóstico é pulável.

As definições de orientação e o conteúdo da ajuda contextual vivem em código (não em tabela): mudá-los é mudar o produto, o que passa por deploy, não por painel administrativo.
