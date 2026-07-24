# 04: Requisitos

Requisitos funcionais organizados por módulo, com identificador e critério de aceite curto. Os IDs servem para rastrear o que está pronto. Os detalhes de fluxo estão em `docs/03-jornadas.md`.

## 4.1 Autenticação e perfil (AUTH)

| ID | Requisito | Aceite |
|---|---|---|
| AUTH-01 | Criar conta com nome, e-mail e senha | Cria usuário e linha em `broker` |
| AUTH-02 | Login e logout | Sessão persiste no aparelho |
| AUTH-03 | Recuperar senha por e-mail | Recebe link e redefine |
| AUTH-04 | Editar perfil (nome, telefone, imobiliária, avatar) | Alterações salvam |
| AUTH-06 | Enviar CRECI + documento para verificação (opcional) | Status vai para `pendente`; reenvio bloqueado durante a análise |
| AUTH-07 | Selo de corretor verificado na página pública do imóvel | Só aparece com `creci_status = aprovado`; CRECI não verificado não é exibido |
| AUTH-05 | Isolamento por corretor | Cada corretor só vê os próprios dados |

## 4.2 Leads e funil (LEAD)

| ID | Requisito | Aceite |
|---|---|---|
| LEAD-01 | Cadastro rápido (etapa 1) só com nome e WhatsApp obrigatórios | Salva sem os demais campos |
| LEAD-02 | Detectar WhatsApp duplicado na carteira | Oferece abrir o lead existente |
| LEAD-03 | Editar todos os campos do lead na ficha | Alterações salvam e entram na timeline quando relevante |
| LEAD-04 | Lista de leads com busca por nome/WhatsApp | Retorna resultados corretos |
| LEAD-05 | Filtros por status, origem, interesse e público | Combina filtros |
| LEAD-06 | Funil kanban com colunas agrupadas | Mostra todos os leads por grupo |
| LEAD-07 | Etapa muda sozinha com eventos comerciais; ajuste manual pelo seletor | Persiste e gera atividade |
| LEAD-08 | Regras de Perdida (motivo) e Reativar (data + tarefa) | Exige o dado e cria a tarefa |
| LEAD-09 | Timeline de atividades da lead | Registra notas, status, preferências, seleção, visitas, conversão; é apoio, não a área principal da ficha |
| LEAD-10 | Nota manual na timeline | Corretor registra texto livre datado |
| LEAD-11 | Ficha da lead com as seções na ordem definida | Cabeçalho, resumo, preferências, imóveis enviados, imóvel prioritário, visitas, tarefas, timeline (JL2) |
| LEAD-12 | Título "Ficha da lead" e ações de conversão com destaque secundário | Antes de converter, nunca "Ficha do cliente"; "Converter em cliente" não compete com "Selecionar imóveis" |
| LEAD-13 | Mudar status nunca converte | `status` não altera `is_client`, `converted_at` nem acesso sensível |

## 4.2.1 Preferências da lead (PREF)

| ID | Requisito | Aceite |
|---|---|---|
| PREF-01 | Registrar e editar preferências em bloco próprio | Salva todos os campos de perfil (JL3) |
| PREF-02 | Salvar sugere `preferencias_definidas` e entra na timeline | Sugestão confirmável |
| PREF-03 | "Usar preferências para buscar imóveis" prepara o filtro da seleção | Sem match automático nesta etapa |

## 4.2.2 Seleção de imóveis (SELECT)

| ID | Requisito | Aceite |
|---|---|---|
| SELECT-01 | Buscar e filtrar imóveis disponíveis da própria carteira | Só imóveis disponíveis, filtros mínimos de JL4 |
| SELECT-02 | Criar seleção com um ou vários imóveis | Cria `property_selection` + `selection_item` |
| SELECT-03 | Ficha agrupa imóveis por seleção enviada | Estado vazio orienta "Selecionar imóveis" |
| SELECT-04 | Registrar manualmente a resposta da lead por imóvel | Um dos estados de `selection_response`, mostrado por texto |
| SELECT-05 | Seleção salva de forma a permitir o link público depois | Persistência correta; link em si fora de escopo |

## 4.2.3 Imóvel prioritário e decisão (PRIOR)

| ID | Requisito | Aceite |
|---|---|---|
| PRIOR-01 | Marcar um imóvel enviado como prioritário | Alimenta a seção própria; não converte a lead |
| PRIOR-02 | Feedback de visita abre a pergunta de avanço | Opções: prioritário, iniciar conversão, avaliando, sem interesse (JL7) |

## 4.2.4 Conversão em cliente (CONV)

| ID | Requisito | Aceite |
|---|---|---|
| CONV-01 | Converter só por ação explícita em `POST /leads/:id/convert` | Rota dedicada, nunca por mudança de status |
| CONV-02 | Exigir motivo, próxima etapa e consentimento LGPD | Campos obrigatórios; imóvel relacionado quando aplicável |
| CONV-03 | Conversão preserva id, cadastro e timeline | Não duplica a pessoa |
| CONV-04 | Conversão liga `is_client` e `converted_at` e move status para `convertida_em_cliente` | Efeitos atômicos + `lead_activity` de conversão |
| CONV-05 | Após converter, libera telas sensíveis (documentos, simulação, proposta) | Área de cliente disponível |
| CONV-06 | Finalidade (compra/locação) obrigatória; "outro" motivo exige descrição | Revalidado no back |
| CONV-07 | Tela de confirmação antes de converter, sem conversão silenciosa | "Serão liberados campos... histórico preservado" + Confirmar/Voltar |
| CONV-08 | Conversão registra consentimento LGPD e trilha de auditoria | Cria `consent` (finalidade + versão) e `audit_log` sem dado sensível |

## 4.2.4.1 Área de Clientes (CLIENT) — fatia 1 entregue

| ID | Requisito | Aceite |
|---|---|---|
| CLIENT-01 | Menu Clientes + rota `/clientes`, só pessoas convertidas | Lista apenas `is_client` do corretor |
| CLIENT-02 | Listagem só com campos seguros | Nunca CPF completo, renda ou documentos na lista |
| CLIENT-03 | Busca (nome, WhatsApp, e-mail, CPF) e filtro finalidade | Compra/locação; estado vazio orienta "Ver leads" |
| CLIENT-04 | Ficha `/clientes/:id` reaproveita a jornada da lead | Mesma timeline; seções Visão geral, Dados pessoais, Negociação, Financeiro, Timeline, Privacidade |
| CLIENT-05 | Seção Privacidade e consentimentos existe e lê o registro | Finalidade, versão e data do consentimento |
| CLIENT-06 | Isolamento por corretor em toda leitura/escrita | `broker_id` do JWT; corretor B recebe 404 para cliente do A (testado) |
| CLIENT-07 | Ações de correção/exclusão e dados pessoais/financeiros preparados | Placeholders "em breve"; CPF e financeiro não obrigatórios no início |
| CLIENT-08 | Convertida sai de Leads e vive em Clientes | `GET /leads` filtra `is_client=false`; `/leads/:id` redireciona para `/clientes/:id`; funil mostra Clientes como atalho com contagem |
| CLIENT-09 | Dados pessoais editáveis com coleta progressiva (fatia 2) | `PATCH /clients/:id/profile`; nada obrigatório; CPF/CEP/UF validados quando preenchidos; CPF exibido formatado |
| CLIENT-10 | Dados da negociação editáveis (fatia 2) | `PATCH /clients/:id/negotiation`; valor, prazo, forma de pagamento, financiamento, observações |
| CLIENT-11 | Alterações de dados auditadas sem valores | `audit_log` guarda só os nomes dos campos alterados |
| CLIENT-12 | Dados financeiros isolados e sensíveis (fatia 3) | `PATCH /clients/:id/financial`; nunca em lista, Dashboard, URL ou log |
| CLIENT-13 | Participantes adicionais (cônjuge, fiador...) | CRUD em `/clients/:id/participants`; CPF mascarado na exibição |
| CLIENT-14 | Exclusão controlada de dados (LGPD) | "Solicitar exclusão" mostra impacto e REGISTRA a solicitação (não apaga); estrutura para retenção/anonimização |

Fatias seguintes: dados pessoais e negociação editáveis (`client_profile`, máscara de CPF); dados financeiros (`client_financial`, sensível, fora de listas/URLs), participantes, privacidade/consentimentos completa, auditoria ampla e a ação controlada de exclusão/retenção.

## 4.2.5 Compartilhamento de imóveis (SHARE)

Relação imóvel ↔ lead N:N via `selection_item`; um envio de um só imóvel é uma seleção com um item (JL9). O `broker_id` sempre vem do token.

| ID | Requisito | Aceite |
|---|---|---|
| SHARE-01 | "Enviar para uma lead" na ficha e no menu do imóvel | Ação principal, mais destaque que arquivar/excluir |
| SHARE-02 | Selecionar lead existente ou cadastrar na hora | Busca por nome/WhatsApp com dados-resumo |
| SHARE-03 | Revisar imóvel e escolher nível de localização e mensagem | location_display + mensagem personalizada |
| SHARE-04 | Criar compartilhamento e abrir WhatsApp com mensagem pronta | Cria seleção+item, gera token e URL, registra envio |
| SHARE-05 | Enviar o mesmo imóvel para várias leads sem duplicar o imóvel | Cada envio é registro próprio com link próprio |
| SHARE-06 | Ficha do imóvel lista "Leads que receberam" com estado de cada envio | Nome, data, status, resposta, visita, ações |
| SHARE-07 | Ficha da lead lista "Imóveis enviados" com estado de cada envio | Foto, título, valor, status do link, visualizações, resposta |
| SHARE-08 | Reenviar sem duplicar; "Criar novo compartilhamento" para link novo | Atualiza data e conta reenvio; ou cria seleção nova |
| SHARE-09 | Revogar e validade opcional do link | revoked_at / expires_at; histórico preservado |

## 4.2.6 Página pública do compartilhamento (PUB)

| ID | Requisito | Aceite |
|---|---|---|
| PUB-01 | Abrir `/compartilhamento/{token}` sem login | Só dados autorizados do imóvel |
| PUB-02 | Registrar visualização | Primeiro acesso, último acesso, contagem |
| PUB-03 | Responder por imóvel com comentário opcional | Interesse/talvez/sem interesse/quero visitar; por item, isolado por lead |
| PUB-04 | "Quero visitar" cria solicitação de visita | Vinculada a lead, imóvel, seleção, corretor; status solicitada |
| PUB-05 | Link revogado/expirado mostra aviso e não expõe dados | Mensagem padrão de indisponível |
| PUB-06 | Token opaco e isolamento total por corretor | Não expõe ids internos; sem acesso cruzado entre corretores |

## 4.3 Follow-up e agenda (TASK)

| ID | Requisito | Aceite |
|---|---|---|
| TASK-01 | Criar tarefa com título e data ligada a um lead | Vira a próxima ação do lead |
| TASK-02 | Concluir tarefa e oferecer criar a próxima | Marca feita e sugere nova |
| TASK-03 | Reagendar tarefa | Atualiza data mantendo histórico |
| TASK-04 | Agenda com "hoje" e "atrasadas" | Lista correta por data |
| TASK-05 | Alerta de lead ativo sem tarefa aberta | Lead aparece no alerta |
| TASK-06 | Alerta de lead parado há mais de X dias | X é constante no código |

Tarefa é um `agenda_event` de `type = tarefa` (ver 2.5). Toda a agenda vive em `/agenda`.

## 4.3.1 Agenda operacional (AGENDA)

| ID | Requisito | Aceite |
|---|---|---|
| AGENDA-01 | Tela `/agenda` com FullCalendar vestido no Design System | Dia, Semana, Mês e Lista; semana no desktop, lista/dia no mobile (grade semanal nunca comprimida) |
| AGENDA-02 | Resumo operacional clicável | Tarefas atrasadas, tarefas de hoje, visitas de hoje, visitas a confirmar; clicar aplica o filtro |
| AGENDA-03 | Criar tarefa e compromisso pelo seletor "O que criar?" | Tarefa (título, data, dia inteiro/horário, lead, tipo, lembrete) e compromisso (título, início e fim, local) |
| AGENDA-04 | Conflito de horário na criação/reagendamento | Avisa os eventos ocupados e permite confirmar mesmo assim (`force`) |
| AGENDA-05 | Ações do evento | Tarefa: concluir, editar, reagendar, abrir lead, excluir. Compromisso: editar, duplicar, excluir. Excluir sempre com confirmação |
| AGENDA-06 | Filtros e limpar | Tipo, origem (Nexlar/Google), situação, só atrasadas, mostrar concluídas |
| AGENDA-07 | Tarefa de dia inteiro só fica atrasada após o dia virar | Tarefa "de hoje" sem horário não conta como atrasada |
| AGENDA-08 | Quatro estados + estado vazio orientado | Carregando, vazio (com ações), erro e sucesso; conflito tratado |
| AGENDA-09 | Datas em UTC no banco, exibidas no fuso do corretor | Sem assumir fuso único |

Fora desta fase (próximas fatias): visita e bloqueio pela tela, drag-and-drop; integração individual com Google Calendar (OAuth no back, tokens criptografados, push Nexlar→Google, free/busy, sync_status); horários de atendimento para o agendamento público futuro.

## 4.4 Documentos (DOC)

| ID | Requisito | Aceite |
|---|---|---|
| DOC-01 | Checklist por etapa (1 e 2) | Mostra itens de cada etapa |
| DOC-02 | Itens extras quando público exterior | Aparecem só nesse caso |
| DOC-03 | Upload de arquivo (PDF/imagem) por item | Sobe para bucket privado |
| DOC-04 | Status por documento (pendente/recebido/validado/recusado) | Persiste e mostra quantos faltam |
| DOC-05 | Recusa com motivo volta item a pendente | Registra motivo |

## 4.5 Visitas e imóveis (VISIT)

| ID | Requisito | Aceite |
|---|---|---|
| VISIT-01 | Criar visita manual associada a um imóvel enviado | Salva `property_id` e `selection_id` de origem |
| VISIT-02 | Associar um ou mais imóveis à visita | Imóvel principal + N:N para múltiplos |
| VISIT-03 | Alterar status da visita | solicitada, aguardando_confirmacao, confirmada, realizada, remarcada, cancelada, nao_compareceu, aguardando_feedback |
| VISIT-04 | Registrar feedback estruturado pós-visita | Interesse, positivos, negativos, avançar, ver outros, próxima ação (JL7) |
| VISIT-05 | Cancelar ou remarcar visita | Mantém histórico |

## 4.6 Simulação (SIM)

| ID | Requisito | Aceite |
|---|---|---|
| SIM-01 | Atalho para o simulador da Caixa | Abre em nova aba |
| SIM-02 | Registro manual do resultado | Salva os campos principais |
| SIM-03 | Status pendente/realizada | Alimenta alertas e sugestão de status |
| SIM-04 | Múltiplas simulações por lead | Permitido |

## 4.7 Dashboard e métricas (DASH)

| ID | Requisito | Aceite |
|---|---|---|
| DASH-01 | Tarefas de hoje e atrasadas | Lista correta |
| DASH-02 | Total de leads no mês | Número correto |
| DASH-03 | Leads ativos por etapa do funil | Contagem por grupo |
| DASH-04 | Alertas clicáveis levam à lista filtrada | Navegação correta |
| DASH-05 | Visitas na semana e no mês | Contagem correta |
| DASH-06 | Conversões lead→visita e visita→negociação | Cálculo a partir dos dados |
| DASH-07 | Tempo médio primeiro contato → fechamento | Cálculo a partir dos dados |

## 4.8 Requisitos não-funcionais (NFR)

**Segurança e acesso.** Autorização por dono aplicada pela API em toda leitura e escrita: o `broker_id` vem do token autenticado e filtra tudo, conforme `docs/06`. Senhas em Argon2id, JWT de vida curta com refresh, rate limiting e CORS restrito. Bucket de documentos privado, com acesso só via URLs assinadas de curta duração geradas para o corretor dono. Nenhum dado sensível trafega ou aparece para outro corretor, e o isolamento é coberto por teste automatizado com dois corretores.

**LGPD e dados sensíveis.** O produto guarda CPF, renda (contracheques, IR) e documentos pessoais. Isso exige cuidado explícito. No MVP: consentimento no cadastro do lead (checkbox com texto claro de que o corretor tem autorização para guardar os dados daquela pessoa), consentimento adicional obrigatório no momento da **conversão em cliente** (campo `consent` de `conversion`, quando se liberam dados sensíveis), política de privacidade acessível, e uma ação de exclusão do lead que apaga também os documentos no storage. Minimização levada a sério pela separação lead/cliente: na fase de lead só há dados de contato e preferências; CPF, renda e documentos só entram após a conversão consciente, quando há avanço real. Registrar em qual base legal o corretor opera fica documentado para a fase de contrato com o cliente.

**Performance e uso.** Mobile-first de verdade: as telas de cadastro rápido, funil e ficha precisam responder bem em conexão de celular. Cadastro rápido com meta de conclusão em trinta segundos. Listas paginam ou usam carregamento incremental para carteiras grandes.

**Estados de interface.** Toda tela trata carregando, vazio, erro e sucesso. Estado vazio sempre com orientação de próximo passo. Erros de rede não descartam dados digitados.

**Acessibilidade básica.** Contraste adequado, alvos de toque generosos, navegação por teclado nos formulários, rótulos em todos os campos.

**Idioma.** Interface em português do Brasil. Datas e valores em formato brasileiro.

## 4.8.1 Escopo da revisão de jornada (julho de 2026)

Esta revisão estrutura a **fase de lead** (prospecção, seleção de imóveis, respostas, visitas, imóvel prioritário), o **compartilhamento de imóveis com a página pública** (JL9, JL10) e a **conversão consciente** em cliente. Ver jornadas JL1–JL10 em `docs/03` e entidades 2.12–2.16 (incluindo 2.14b, página pública) em `docs/02`.

**Compartilhamento (decisão de 20 jul 2026):** modelo unificado, sem tabela `property_shares` separada. Um envio é uma `property_selection`; cada imóvel é um `selection_item`. Enviar um único imóvel da ficha do imóvel é uma seleção com um item. Imóvel ↔ lead é N:N; o imóvel nunca é duplicado por envio. A página pública `/compartilhamento/{token}` entra nesta entrega.

**Correções obrigatórias na implementação atual (foram introduzidas antes desta revisão):**
- Renomear "Ficha do cliente" / "Abrir ficha do cliente" para "Ficha da lead" / "Abrir ficha da lead".
- Remover qualquer conversão automática e a navegação que tratava "em atendimento" como virar cliente.
- Remover o evento de conversão gerado por mudança comum de status.
- Separar `status` de `is_client`/`converted_at`; mudar status nunca converte.
- Adicionar as seções da ficha: preferências, imóveis enviados, imóvel prioritário, visitas.
- Criar a ação e a rota explícitas de conversão (`POST /leads/:id/convert`).
- Tirar a timeline do centro da ficha.

**Fora do escopo desta etapa** (ficam para depois, não construir agora): agendamento público conectado à agenda, integração com Google Calendar, match automático por IA, envio automático por WhatsApp API, documentos, financiamento completo, proposta, assinatura, pagamento, portal público completo, compartilhamento global de imóveis, painel administrativo, sistema para imobiliárias e distribuição de leads entre corretores. Observação: a página pública do compartilhamento e a resposta da lead pelo link, antes fora desta etapa, **passaram a fazer parte dela** (PUB-01 a PUB-06). A solicitação de visita pela lead entra; a conexão automática com a agenda, não.

## 4.9 Fora de escopo do MVP (fases seguintes)

Estes itens não entram agora. Ficam registrados para orientar as decisões de arquitetura, não para construir.

Fase 2, credibilidade e captação: consulta automática do CRECI no COFECI, painel de administração para a fila de verificação (hoje a aprovação é manual, direto no banco), página pública do corretor com perfil e botão de contato, formulário público de captação de leads, SEO básico.

> A verificação manual de CRECI (`nao_enviado → pendente → aprovado/recusado`) saiu do fora de escopo em 23 jul 2026 e está no MVP. Enviar é opcional: quem não envia usa o sistema inteiro, só não ganha o selo.

Fase 3, financiamento e parceiros: gestão de parceiros (advogado, despachante, correspondente, tradutor), checklist por tipo de cliente, integração ou registro estruturado de simulações mais rico, documentação avançada, fluxos com correspondentes.

Fase 4, equipes e imobiliárias: múltiplos usuários, distribuição de leads, permissões por papel, relatórios por corretor, carteira compartilhada da imobiliária.

Decisões de produto ainda abertas (para validar com o cliente antes das fases seguintes): se a página pública entra já na fase 2 ou antes; se o CPF deve ser obrigatório em algum ponto do MVP; quais documentos são realmente obrigatórios por caso de financiamento; o modelo de cobrança e a faixa de mensalidade aceitável. Essas perguntas vêm do documento de alinhamento e não bloqueiam a construção do core.
