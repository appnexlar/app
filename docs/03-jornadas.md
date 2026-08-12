# 03: Jornadas do corretor

Cada jornada descreve um fluxo real de ponta a ponta: o gatilho, os passos, os estados de tela, as exceções e os critérios de aceite. Os critérios de aceite são a definição de pronto de cada jornada e servem de base para os testes.

Convenção: "corretor" é o usuário autenticado. Toda escrita de dado carrega o `broker_id` dele por baixo. Nenhuma jornada expõe dado de outro corretor.

## Enquadramento: lead x cliente (revisão de julho de 2026)

O Nextlar acompanha uma pessoa desde o primeiro contato até virar cliente. Há duas grandes fases, e elas não podem se misturar:

- **Fase de lead (prospecção e avaliação).** A pessoa recebe imóveis, visualiza, demonstra ou rejeita interesse, pede e faz visitas, escolhe um imóvel prioritário e continua comparando. Tudo isso acontece sem exigir dados sensíveis. É o foco desta entrega, coberto pelas jornadas **JL1 a JL8** abaixo.
- **Fase de cliente (etapa formal).** Começa por uma **conversão consciente** (JL8), quando a pessoa entra em financiamento, análise, documentos ou proposta. Só aí se liberam os dados e telas sensíveis. As jornadas **J5 (documentação), J6 (simulação) e J8 (negociação)** pertencem a esta fase e pressupõem uma lead já convertida.

Regra que atravessa todas as jornadas: **uma simples mudança de status nunca transforma lead em cliente.** A conversão só acontece pela ação explícita descrita em JL8, que liga `is_client` e `converted_at` e cria o registro `conversion` (ver `docs/02`). As jornadas JL1–JL8 têm precedência sobre descrições anteriores no que houver conflito.

Atualização de escopo (20 jul 2026): o **compartilhamento de imóveis com a lead e a página pública passam a fazer parte desta entrega** (jornadas JL9 e JL10). O corretor envia um imóvel para uma lead, gera um link individual, abre o WhatsApp, e a lead abre o link sem login, visualiza, responde e pode pedir visita. Continuam fora do escopo desta entrega (ver `docs/04`): agendamento público conectado à agenda, Google Calendar, match automático por IA, envio automático por WhatsApp API, documentos, financiamento completo, proposta, assinatura, painel administrativo, multiusuário e compartilhamento global entre corretores.

---

## J0: Onboarding: cadastro e login do corretor

**Gatilho.** Pessoa acessa o Nextlar pela primeira vez.

**Passos.**
1. Tela inicial oferece Entrar e Criar conta.
2. Em Criar conta, informa nome completo, e-mail e senha. Opcional: telefone e nome da imobiliária.
3. Sistema cria o usuário no auth e a linha em `broker` com o mesmo id.
4. Primeiro acesso cai no Dashboard em estado vazio, com uma chamada clara para cadastrar o primeiro lead.
5. Em acessos seguintes, Entrar leva direto ao Dashboard.

**Estados e exceções.**
- E-mail já cadastrado: mensagem clara, oferece ir para Entrar.
- Senha fraca: validação inline com a regra mínima.
- Recuperação de senha por e-mail (magic link ou reset).
- Sessão persistente: o corretor não precisa logar toda vez no mesmo aparelho.

**Critérios de aceite.**
- Consigo criar conta, sair e entrar de novo com as mesmas credenciais.
- Ao criar conta, existe uma linha em `broker` ligada ao meu usuário.
- Não consigo ver nenhum dado antes de estar autenticado.
- O Dashboard vazio explica o que fazer primeiro.

---

## J1: Cadastro rápido de lead (a jornada mais importante)

**Gatilho.** Chega um contato novo pelo WhatsApp, Instagram, TikTok ou indicação e o corretor quer registrar antes de esquecer. A meta é registrar em menos de trinta segundos.

**Passos.**
1. Botão de ação primária "Novo lead" está sempre visível (botão flutuante no mobile, presente em Dashboard, Funil e Lista).
2. Abre o formulário curto da etapa 1. Só dois campos são obrigatórios: nome e WhatsApp.
3. Campos opcionais na mesma tela, sem travar o salvamento: origem, interesse, público (Brasil/exterior), cidade/bairro, faixa de valor, observações. CPF fica disponível mas nunca obrigatório aqui.
4. Ao salvar, o lead nasce com status `novo` e o corretor volta para a origem (ou vai para a ficha, ver preferência abaixo).
5. Sistema registra `lead_activity` de criação e sugere criar a primeira próxima ação (ex.: "Fazer primeiro contato hoje").

**Detalhes de baixo atrito.**
- O campo WhatsApp aceita colar número em qualquer formato e normaliza.
- Origem e interesse são chips de toque único, não dropdowns longos.
- Após salvar, um toast com "Ver ficha" e "Cadastrar outro" permite encadear cadastros.

**Estados e exceções.**
- Nome ou WhatsApp em branco: bloqueia com validação inline, sem perder o que já foi digitado.
- WhatsApp duplicado (mesmo número já existe na carteira do corretor): avisa e oferece abrir o lead existente em vez de duplicar.
- Sem conexão: preserva o formulário e avisa; não perde o que foi digitado.

**Critérios de aceite.**
- Consigo salvar um lead informando só nome e WhatsApp.
- Um lead novo aparece imediatamente na coluna Novo do funil e no topo da lista.
- Tentar cadastrar um número que já existe me leva ao lead existente.
- O CPF nunca é exigido nesta tela.

---

## JL1: Jornada operacional da lead (backbone)

**Gatilho.** A lead foi cadastrada e o corretor vai conduzi-la até a decisão.

**Sequência principal.**
1. Lead cadastrada (J1).
2. Preferências registradas (JL3).
3. Corretor seleciona imóveis compatíveis da própria carteira (JL4).
4. Seleção de imóveis é criada (JL4).
5. Link da seleção é enviado pelo WhatsApp (envio real fica para depois; nesta etapa a seleção é salva).
6. Lead visualiza os imóveis.
7. Lead responde sobre cada imóvel (registro manual nesta etapa).
8. Lead solicita uma visita.
9. Corretor confirma ou reorganiza a visita (JL6).
10. Visita é realizada.
11. Corretor registra o feedback (JL7).
12. Um imóvel pode ser marcado como prioritário (JL5).
13. Lead decide avançar (JL7 → JL8).
14. Lead é convertida em cliente (JL8).
15. Dados adicionais, documentos, financiamento e proposta são liberados (fase de cliente).

**Escopo desta entrega.** Estruturar corretamente até o passo 12 e preparar o passo 13. Do 14 em diante, apenas a ação de conversão e a liberação da fase de cliente; o detalhe de documentos/financiamento/proposta continua nas jornadas J5, J6 e J8, agora entendidas como pós-conversão.

---

## JL2: Ficha da lead

**Gatilho.** O corretor abre `/leads/:id` para trabalhar a lead. Título da tela: **Ficha da lead** (nunca "Ficha do cliente" antes da conversão).

**Estrutura da ficha, nesta ordem.** A timeline é histórico de apoio e fica por último, não é a área principal.
1. **Cabeçalho.** Nome, WhatsApp, e-mail, status atual, origem, última atividade, próxima ação e data de cadastro.
2. **Resumo.** Compacto: origem, interesse, região, faixa de valor, tipo de imóvel, quartos, necessidade de financiamento, observações principais, próxima tarefa e último contato. Não é um formulário longo.
3. **Preferências** (JL3).
4. **Imóveis enviados** (JL4) — parte central da tela.
5. **Imóvel prioritário** (JL5).
6. **Visitas** (JL6).
7. **Tarefas** (mesmo motor de J3, sempre ligadas à lead: atrasadas, de hoje, próximas, concluídas; criar, concluir, reagendar, abrir).
8. **Timeline** (histórico cronológico; ver `docs/02` 2.4).

**Ações do cabeçalho.**
- Principais: Selecionar imóveis, Conversar no WhatsApp, Criar tarefa, Editar dados, Alterar status.
- Secundárias: Converter em cliente, Marcar como perdida, Excluir lead.

**Regra visual.** "Converter em cliente" é ação secundária e não pode ter o mesmo destaque de "Selecionar imóveis". "Alterar status" não oferece `convertida_em_cliente` como destino livre (JL8).

**Critérios de aceite.**
- A ficha se identifica como lead e mostra os dados básicos no cabeçalho e no resumo.
- As seções aparecem na ordem acima, com a timeline por último.
- Excluir lead pede confirmação; alterar status não converte.

---

## JL3: Preferências da lead

**Gatilho.** O corretor entende o perfil do imóvel que a lead procura.

**Passos.**
1. Seção Preferências na ficha, editável em bloco próprio.
2. Campos: finalidade (comprar/alugar/investir), categoria, tipo, cidade, bairros ou regiões, faixa mínima e máxima, quartos mínimos, banheiros mínimos, vagas mínimas, área mínima, características desejadas, características rejeitadas, aceita condomínio, precisa de financiamento, prazo, observações.
3. Salvar registra `preferencias` na timeline e sugere o status `preferencias_definidas`.

**Ações.** Editar preferências; Usar preferências para buscar imóveis (nesta etapa apenas prepara o filtro da seleção, sem match automático).

**Critérios de aceite.**
- Consigo registrar e editar as preferências da lead e elas ficam salvas.
- Salvar sugere `preferencias_definidas` e entra na timeline.

---

## JL4: Seleção de imóveis (imóveis enviados)

**Gatilho.** O corretor vai enviar à lead imóveis compatíveis da própria carteira. Esta é a parte central da ficha.

**Selecionar imóveis.**
1. Ação "Selecionar imóveis" abre uma tela, modal amplo ou drawer.
2. O corretor busca imóveis da própria carteira e filtra por: finalidade, categoria, tipo, cidade, bairro, faixa de preço, quartos, banheiros, vagas, área, disponibilidade. Só imóveis disponíveis aparecem.
3. Seleciona um ou vários, revisa a seleção e salva.
4. Salvar cria uma `property_selection` com seus `selection_item`, registra `selecao` na timeline e sugere o status `imoveis_enviados`.

**Seção "Imóveis enviados" na ficha.**
- Estado vazio: título "Nenhum imóvel enviado" e a orientação "Selecione imóveis da sua carteira que combinam com o perfil desta lead", com a ação "Selecionar imóveis".
- Com registros: agrupar por seleção ("Seleção enviada em 20 de julho"), mostrando data de criação, data de envio, status do link, último acesso, quantidade de imóveis, e ações de reenviar e abrir seleção. Dentro de cada seleção, os imóveis.

**Card de imóvel enviado.** Mostra foto de capa, título, tipo, cidade e bairro, valor, quartos, banheiros, vagas, área, data do envio, disponibilidade, resposta da lead, visita relacionada e indicação de prioridade. A resposta é sempre por texto, não só por cor: Não visualizado, Visualizado, Tenho interesse, Talvez, Não tenho interesse, Quero visitar, Visita agendada, Visitado, Escolhido para avançar. Ações do card: Abrir imóvel, Registrar resposta manualmente, Agendar visita, Marcar como prioritário, Avançar com este imóvel.

**Mesmo modelo do compartilhamento.** Enviar um único imóvel a partir da ficha do imóvel (JL9) é uma seleção com um item; esta seção "Imóveis enviados" da ficha da lead é o outro lado do mesmo registro. As respostas podem vir da página pública (JL10) ou ser registradas manualmente aqui.

**Critérios de aceite.**
- Consigo criar uma seleção buscando e filtrando imóveis disponíveis da minha carteira.
- A seleção salva aparece na ficha agrupada, com seus imóveis.
- Consigo registrar manualmente a resposta da lead para cada imóvel.
- O estado vazio orienta o próximo passo.

---

## JL5: Imóvel prioritário

**Gatilho.** A lead tem um imóvel principal em avaliação, sem ainda ser cliente.

**Passos.**
1. Marcar um `selection_item` como prioritário (`is_priority`) alimenta a seção "Imóvel prioritário" da ficha.
2. A seção mostra foto, título, valor, localização resumida, status da visita, última resposta e próxima ação.

**Regra.** Marcar prioritário não converte a lead. Ela continua podendo receber outros imóveis, mudar de prioridade, desistir ou seguir comparando.

**Critérios de aceite.**
- Consigo marcar um imóvel enviado como prioritário e ele aparece na seção própria.
- A lead permanece lead após marcar prioridade.

---

## JL6: Visita (revisada)

**Gatilho.** A lead pediu para visitar, ou o corretor vai levá-la a um imóvel enviado.

**Passos.**
1. Seção Visitas na ficha. Criar visita manualmente, associando a um imóvel enviado (e à seleção de origem quando houver).
2. Campos: imóvel, data, horário, status, origem da solicitação, observação, feedback, próxima ação.
3. Status: Solicitada, Aguardando confirmação, Confirmada, Realizada, Remarcada, Cancelada, Não compareceu, Aguardando feedback.
4. Alterar o status gera atividade e, quando fizer sentido, sugere o status da lead (`visita_agendada`, `visitando_imoveis`).

**Escopo desta entrega.** Criar visita manualmente, associar a um imóvel enviado, alterar status e registrar feedback. O agendamento público pela lead vem depois.

**Critérios de aceite.**
- Consigo criar uma visita ligada a um imóvel enviado e mudar seu status.
- Consigo registrar o feedback da visita.

---

## JL7: Feedback da visita e decisão de avanço

**Gatilho.** A visita foi realizada.

**Passos.**
1. Registrar feedback estruturado: nível de interesse, pontos positivos, pontos negativos, deseja avançar, deseja visitar outros imóveis, observação, próxima ação.
2. Ao salvar, a ficha pergunta: **"A lead deseja avançar com este imóvel?"** com as opções: Marcar como prioritário, Iniciar conversão em cliente, Ainda está avaliando, Não teve interesse.
3. "Iniciar conversão em cliente" leva a JL8. As demais mantêm a pessoa como lead.

**Critérios de aceite.**
- Registrar feedback abre a pergunta de avanço.
- Cada opção leva ao efeito certo, e só "Iniciar conversão" caminha para a conversão.

---

## JL8: Conversão em cliente (ação consciente)

**Gatilho.** A pessoa vai entrar numa etapa formal que exige dados completos: financiamento, análise, documentos ou proposta.

**Passos.**
1. Ação "Converter em cliente" (secundária na ficha, ou vinda de JL7).
2. Abre a confirmação: "Converter esta lead em cliente? Use essa ação quando a pessoa iniciar uma etapa que exija dados completos, documentos, financiamento, análise ou proposta."
3. Campos obrigatórios: motivo da conversão (Início de financiamento, Solicitação de documentos, Análise cadastral, Preparação de proposta, Negociação formal, Outro), próxima etapa, imóvel relacionado quando aplicável, e consentimento para coleta de dados adicionais (LGPD).
4. Confirmar chama `POST /leads/:id/convert`.

**Efeitos.** Mantém o mesmo cadastro (não duplica a pessoa), preserva toda a timeline, registra `converted_at`, liga `is_client`, move o status para `convertida_em_cliente`, relaciona o imóvel escolhido, mantém a oportunidade ativa, libera os campos e telas sensíveis (documentos, simulação, proposta) e registra `conversao` na timeline. A partir daí a pessoa aparece na base de clientes.

**Regra técnica.** `Novo lead → Em atendimento` (ou qualquer mudança comum de status) não pode alterar `is_client`, `converted_at`, o tipo da pessoa nem o acesso à área sensível. A conversão só acontece pela rota específica.

**Critérios de aceite.**
- Só consigo converter pela ação explícita, informando motivo, próxima etapa e consentimento.
- Após converter, a pessoa continua com o mesmo id e histórico, passa a ser cliente e libera a área sensível.
- Mudar status de lead nunca converte.

---

## JL9: Enviar um imóvel para uma lead (compartilhamento)

**Gatilho.** O corretor está na ficha de um imóvel e quer enviá-lo para uma pessoa específica. A ação principal é **"Enviar para uma lead"**, não "Gerar link": o objetivo é enviar aquele imóvel para alguém, não produzir um link solto.

**Passos.**
1. Na ficha do imóvel (ou no menu de contexto da listagem), o corretor clica em "Enviar para uma lead".
2. **Etapa 1, selecionar lead.** Busca por nome ou WhatsApp entre as próprias leads, mostrando nome, WhatsApp, status, interesse, região e faixa de valor. Pode cadastrar uma lead nova ali mesmo. No MVP é uma lead por envio; a arquitetura (seleção + itens) já permite várias.
3. **Etapa 2, revisar o imóvel.** Mostra foto de capa, título, valor, tipo, localização e disponibilidade, e deixa o corretor escolher como a localização aparece no link (endereço completo, sem número, bairro e cidade, ou aproximada) e escrever uma mensagem personalizada.
4. **Etapa 3, criar o compartilhamento.** Ao confirmar: cria uma `property_selection` com um `selection_item`, gera o `public_token`, monta a URL pública, registra a data de criação, prepara a mensagem do WhatsApp e abre o WhatsApp da lead. Exemplo de mensagem: "Olá, Mariana! Separei este imóvel com base no que conversamos. Veja os detalhes e me diga o que achou: [link]". O envio no WhatsApp é manual no MVP; o compartilhamento fica registrado de qualquer forma.

**Seção "Leads que receberam este imóvel"** (na ficha do imóvel, abaixo dos dados). Lista cada lead que recebeu, com data do envio, status do link, visualizado ou não, resposta, pedido de visita, visita agendada e última atividade. Ações por linha: abrir lead, reenviar link, abrir WhatsApp, revogar link, abrir visita. A ficha do imóvel também resume visualizações, interesses e pedidos de visita.

**Reenvio e novo link.** Reenviar o mesmo link não duplica o imóvel nem cria outra seleção: atualiza a data e conta o reenvio. "Criar novo compartilhamento" gera uma seleção nova. Revogar mantém o histórico e derruba o link.

**Critérios de aceite.**
- Consigo enviar o mesmo imóvel para várias leads sem duplicar o imóvel; cada envio é um registro com link próprio.
- Ao enviar, abro o WhatsApp da lead com a mensagem pronta e o envio fica registrado.
- A ficha do imóvel mostra quais leads receberam e o estado de cada envio.

---

## JL10: Página pública, visualização e resposta da lead

**Gatilho.** A lead recebe o link e abre em `/compartilhamento/{token}`, sem login.

**Passos.**
1. A página mostra fotos e vídeos autorizados, valor, tipo, características, localização no nível autorizado, descrição e o contato do corretor com botão de WhatsApp. Nunca mostra comissão, proprietário, instruções de chave, observações privadas nem dados sensíveis.
2. Ao abrir, o sistema registra primeiro acesso, último acesso e incrementa a contagem de visualizações; a seleção passa a `visualizada` e a timeline da lead registra o evento.
3. A lead responde por imóvel: Tenho interesse, Talvez, Não tenho interesse ou Quero visitar, com comentário opcional. Cada resposta atualiza o `selection_item` daquela lead, sem afetar a resposta de outra lead sobre o mesmo imóvel.
4. "Quero visitar" cria uma solicitação de visita ligada a lead, imóvel, seleção e corretor, com data ou período e observação, e status `solicitada`. O corretor visualiza e confirma depois (a conexão direta com a agenda vem depois).
5. Links revogados ou expirados mostram: "Este link não está mais disponível. Entre em contato com o corretor para receber uma nova seleção."

**Isolamento e segurança.** A rota pública valida pelo token e serve só o conteúdo daquela seleção. Nenhum corretor acessa respostas, leads ou imóveis de outro; a página nunca expõe ids internos nem dados não autorizados.

**Critérios de aceite.**
- A lead abre o link sem login e vê só os dados autorizados.
- A visualização é registrada (primeiro e último acesso, contagem).
- A resposta é registrada por imóvel e aparece na ficha da lead e na do imóvel.
- "Quero visitar" gera uma solicitação de visita que o corretor vê e confirma.

---

## J2: Qualificação inicial

> Revisão de julho de 2026: a qualificação do interesse e do perfil do imóvel agora vive na seção **Preferências** (JL3). Esta jornada continua válida para a classificação inicial de interesse/público e para as notas de conversa; onde falar em status, valem os status novos de `docs/02` 2.9.

**Gatilho.** Corretor fez o primeiro contato e agora entende a real intenção do lead.

**Passos.**
1. Na ficha do lead, corretor preenche ou ajusta interesse (comprar, financiar, investir, vender, pesquisar) e público (Brasil ou exterior).
2. Ajusta faixa de valor e região se souber mais.
3. Registra uma nota de conversa na timeline ("Cliente quer 2 quartos, até 400 mil, região sul").
4. Move o status para `em_atendimento` e, ao registrar as preferências (JL3), para `preferencias_definidas`.
5. Define a próxima ação com data (ver J3).

**Estados e exceções.**
- Público "exterior" habilita, na etapa de documentos (fase de cliente), o checklist específico de cliente no exterior.
- Se a lead não responde, o corretor mantém `em_atendimento` e agenda um follow-up (J3).

**Critérios de aceite.**
- Consigo classificar interesse e público e isso fica salvo na ficha.
- Marcar público exterior muda o checklist de documentos disponível.
- Cada mudança de status aparece na timeline do lead.

---

## J3: Follow-up e próximas ações (o motor do produto)

**Gatilho.** Todo lead ativo precisa ter uma próxima ação com data. É isso que impede o lead de esfriar.

**Passos.**
1. Na ficha do lead, o corretor cria uma tarefa: título livre e data/hora (ex.: "Ligar amanhã 10h para confirmar interesse").
2. A tarefa vira a próxima ação do lead (`next_action_at` reflete a tarefa aberta mais próxima).
3. No dia do vencimento, a tarefa aparece no bloco "Hoje" da Agenda e no Dashboard.
4. Ao concluir, o corretor marca como feita. Isso registra `lead_activity` de tarefa concluída e o sistema pergunta se quer criar a próxima ação, para o lead nunca ficar órfão.
5. Se a tarefa vence e não é concluída, ela aparece como atrasada, em destaque âmbar.

**Regras de "lead parado".**
- Um lead ativo (não fechado, não perdido) sem nenhuma tarefa aberta é um lead sem próxima ação e entra no alerta "Leads sem follow-up".
- Um lead cuja última atividade passou de X dias (config padrão: 7) entra no alerta "Leads parados". O X é uma constante configurável no código, não precisa de tela de configuração no MVP.

**Estados e exceções.**
- Concluir uma tarefa sem criar a próxima é permitido, mas o lead passa a aparecer no alerta de sem follow-up até ganhar nova ação.
- Reagendar uma tarefa atualiza `due_at` e mantém o histórico.

**Critérios de aceite.**
- Todo lead ativo mostra claramente sua próxima ação e a data.
- Tarefas do dia aparecem no Dashboard e na Agenda.
- Tarefas atrasadas ficam visualmente destacadas.
- Concluir uma tarefa oferece criar a próxima na hora.
- Um lead ativo sem tarefa aberta aparece no alerta de leads sem follow-up.

---

## J4: Trabalhar o funil (kanban)

**Gatilho.** Corretor quer a visão geral de onde está cada lead e mover quem avançou.

**Passos.**
1. Tela Funil mostra uma raia horizontal por etapa (Novos, Atendimento, Imóveis enviados, Visitas, Clientes), empilhadas na vertical, conforme o agrupamento em `docs/02` seção 2.9. O mesmo layout serve mobile e desktop e escala para dezenas de leads: a raia rola na horizontal e o cabeçalho mostra a contagem. Leads perdidas ou a reativar ficam fora do quadro, num atalho discreto abaixo.
2. O cabeçalho de cada raia mostra o nome, a contagem e quantas leads precisam de atenção. Cada card mostra nome, WhatsApp, status específico, faixa de valor e o alerta (ação atrasada, parada há X dias ou a próxima ação).
3. Dentro da raia, quem precisa de atenção vem primeiro: ação atrasada, depois paradas (7+ dias sem contato), depois as demais.
4. Tocar no card abre a folha de ações (abrir ficha, WhatsApp, alterar etapa por seletor). Não há arrastar: o funil anda sozinho e o ajuste manual é pelo seletor, igual no celular e no computador.
5. O funil anda sozinho com os eventos comerciais: imóvel enviado, link aberto, resposta registrada, pedido de visita e imóvel prioritário movem a lead automaticamente (só para a frente, nunca em lead encerrada ou cliente). Toda mudança gera `lead_activity`.
6. Filtro rápido no topo por origem, interesse e público (fatia futura).

**Estados e exceções.**
- Raia vazia mostra texto neutro numa linha, sem ocupar espaço.
- Mover para Perdida pede motivo. Mover para Reativar pede data futura e cria a tarefa de reativação.
- Muitas leads numa raia: a raia rola na horizontal e a contagem diz o total.

**Critérios de aceite.**
- Vejo todas as minhas leads distribuídas por etapa, com contagem por raia.
- O funil se atualiza sozinho com os eventos comerciais; consigo ajustar a etapa pelo seletor do card ou da ficha.
- Mover para Perdida exige motivo; mover para Reativar exige data e cria tarefa.
- "Convertida em cliente" nunca é destino do seletor.
- Cada card mostra o alerta certo e as que precisam de atenção vêm primeiro.

---

## J5: Documentação por etapa

**Gatilho.** O lead avança e passa a exigir documentos, seja para análise bancária, proposta ou fechamento.

**Passos.**
1. Na ficha do lead, aba Documentos mostra um checklist organizado pelas duas etapas.
2. Etapa 1 lista os itens de registro. Etapa 2 lista os itens de análise: comprovante de endereço, três contracheques, imposto de renda, documentos de dependentes, documentos de subsídio e, se o lead for público exterior, os documentos específicos (ex.: tradução juramentada, comprovações do exterior).
3. Cada item tem um status: pendente, recebido, validado ou recusado. O corretor faz upload do arquivo e muda o status conforme confere.
4. Documento recusado permite anotar o motivo, e o item volta a pendente para novo envio.
5. Upload gera `lead_activity` de documento. O bloco mostra quantos itens faltam.

**Estados e exceções.**
- Item de checklist pode existir sem arquivo (pendente), para mostrar o que falta.
- Arquivos aceitos: PDF e imagem, com limite de tamanho. Erro de upload avisa e permite tentar de novo.
- Documentos ficam em bucket privado; só o corretor dono acessa.

**Critérios de aceite.**
- Vejo, por etapa, quais documentos faltam e quais já vieram.
- Consigo anexar um arquivo e marcar como recebido, validado ou recusado.
- Público exterior mostra os itens extras de documentação.
- Nenhum documento de um corretor é acessível por outro.

---

## J6: Simulação bancária

**Gatilho.** O lead precisa de financiamento e o corretor quer registrar a simulação.

**Passos.**
1. Na ficha do lead, aba Simulação oferece um atalho que abre o simulador da Caixa em nova aba.
2. O corretor faz a simulação fora do sistema e volta para registrar o resultado no Nextlar.
3. Formulário de registro manual: valor do imóvel, entrada, valor financiado, prazo em meses, parcela estimada, subsídio (opcional), banco (default Caixa) e observações.
4. Ao salvar, a simulação nasce com status `realizada` e o sistema sugere mover o lead para `simulacao_realizada`.
5. Antes de rodar, o corretor pode registrar uma simulação `pendente` só para marcar que falta fazer, o que coloca o lead no alerta correspondente.

**Estados e exceções.**
- Não há integração automática no MVP. O atalho apenas abre o site do simulador.
- Vários registros de simulação por lead são permitidos (o cliente pode simular mais de um cenário).

**Critérios de aceite.**
- Tenho um atalho visível para o simulador da Caixa.
- Consigo registrar manualmente o resultado com os campos principais.
- Registrar simulação sugere atualizar o status do lead.
- Consigo ter mais de uma simulação no mesmo lead.

---

## J7: Visita e imóveis apresentados

**Gatilho.** O corretor vai levar o cliente para ver imóveis.

**Passos.**
1. Na ficha do lead, aba Visitas, o corretor agenda uma visita com data e hora.
2. Seleciona os imóveis que serão apresentados. Se o imóvel ainda não existe, cadastra na hora (cadastro leve: título, endereço, valor, referência).
3. Agendar sugere mover o lead para `visita_agendada`.
4. Depois da visita, o corretor marca como realizada e registra o feedback do cliente por imóvel ou geral.
5. Marcar realizada sugere mover para `visitou_imovel`. Tudo gera atividade na timeline.

**Estados e exceções.**
- Visita pode ser cancelada ou remarcada, mantendo o histórico.
- Um imóvel cadastrado fica disponível para reuso em outras visitas e leads.

**Critérios de aceite.**
- Consigo agendar uma visita e associar um ou mais imóveis.
- Consigo cadastrar um imóvel novo sem sair do fluxo da visita.
- Consigo registrar o feedback depois da visita.
- Agendar e concluir a visita sugerem a mudança de status correspondente.

---

## J8: Negociação e fechamento

**Gatilho.** O cliente demonstra intenção real e entra em proposta.

**Passos.**
1. Corretor move o lead para `em_negociacao` e registra as notas da negociação na timeline (valores, contrapropostas, prazos).
2. Ao enviar uma proposta formal, move para `proposta_enviada` e agenda a próxima ação de acompanhamento.
3. Confere se a documentação da etapa 2 está validada (o bloco de documentos ajuda a ver pendências).
4. Fechando o negócio, move para `fechado`. O sistema registra a data de fechamento (usada nas métricas de conversão e tempo médio).
5. Se o negócio cai, move para `perdido` com motivo, ou para `reativar_futuro` com data.

**Estados e exceções.**
- Fechar não apaga o histórico; o lead fechado continua consultável.
- Perdido e Reativar seguem as regras de motivo e data descritas em J4.

**Critérios de aceite.**
- Consigo registrar a negociação e mover pelos status até fechado.
- Fechar registra a data usada nas métricas.
- Consigo ver pendências de documento antes de fechar.

---

## J9: Reativação de leads futuros

**Gatilho.** Um lead não fecha agora, mas pode fechar depois (indeciso, fora de timing).

**Passos.**
1. Corretor move o lead para `reativar_futuro` e informa a data de reativação.
2. Sistema cria automaticamente uma tarefa com `due_at` nessa data ("Reativar contato").
3. Quando a data chega, a tarefa aparece na Agenda e no Dashboard como qualquer follow-up.
4. Ao retomar, o corretor move o lead de volta ao funil ativo e segue a partir de onde faz sentido.

**Critérios de aceite.**
- Marcar reativar exige data e cria a tarefa automaticamente.
- A tarefa de reativação aparece no dia certo entre as ações do corretor.
- O lead sai da visão ativa mas continua acessível na coluna Reativar.

---

## J10: Dashboard e métricas

**Gatilho.** O corretor abre o app para saber o que fazer hoje e como está o mês.

**Conteúdo do Dashboard.**
- Bloco de ação do dia: tarefas que vencem hoje e tarefas atrasadas.
- Alertas: leads novos aguardando primeiro contato, leads sem follow-up, leads parados há mais de X dias, documentações pendentes, simulações pendentes.
- Métricas do mês: total de leads cadastrados no mês, leads ativos por etapa do funil, visitas realizadas na semana e no mês, negociações abertas.
- Conversões: lead para visita, visita para negociação, e tempo médio do primeiro contato ao fechamento.

**Estados e exceções.**
- Corretor novo vê o Dashboard vazio com orientação, não números zerados sem contexto.
- Cada alerta é clicável e leva à lista filtrada correspondente.

**Critérios de aceite.**
- Ao abrir, vejo minhas tarefas de hoje e as atrasadas.
- Vejo quantos leads estão em cada etapa do funil.
- Cada métrica de alerta me leva à lista dos leads daquele alerta.
- As taxas de conversão e o tempo médio são calculados a partir dos dados reais do corretor.

---

## J11: Agenda operacional

**Gatilho.** O corretor abre `/agenda` para ver e organizar tarefas, visitas e compromissos.

**Passo a passo (sub-fatia A entregue).**
1. Topo mostra o período atual, "Novo compromisso", o status do Google Calendar (ainda não conectado) e o seletor de visualização. No desktop abre na Semana; no mobile, na Lista (a grade semanal nunca é comprimida em tela pequena).
2. O resumo operacional traz quatro indicadores clicáveis: tarefas atrasadas, tarefas de hoje, visitas de hoje e visitas a confirmar. Clicar aplica o filtro correspondente.
3. "Novo compromisso" (ou selecionar um horário no calendário) abre "O que deseja criar?": Tarefa, Compromisso geral, e — em breve — Visita e Bloqueio.
4. A tarefa pede título e data (dia inteiro por padrão, ou horário), com lead, tipo e lembrete opcionais. O compromisso pede título, início, fim e local opcional.
5. Ao salvar em horário ocupado, o sistema avisa o conflito e deixa confirmar mesmo assim.
6. Tocar num evento abre as ações: tarefa concluir/editar/reagendar/abrir lead/excluir; compromisso editar/duplicar/excluir. Excluir sempre confirma.

**Estados e exceções.**
- Vazio orienta a próxima ação (criar tarefa, agendar visita, conectar Google) em vez de tela morta.
- Tarefa de dia inteiro só vira "atrasada" depois que o dia passa.
- Concluir ou reagendar uma tarefa/visita ligada a lead recalcula a próxima ação da lead (coerência com o funil).

**Critérios de aceite.**
- Alterno entre Dia, Semana, Mês e Lista, no desktop e no celular.
- Crio tarefa e compromisso, concluo e reagendo, com os indicadores refletindo na hora.
- Um horário ocupado me avisa antes de duplicar compromisso.

**Próximas fatias.** Visita e bloqueio pela tela + drag-and-drop; integração individual com Google Calendar (conectar, escolher calendário, sincronizar, free/busy, desconectar); horários de atendimento para o agendamento público futuro da lead.

---

## Mapa de status por jornada (resumo)

Fase de lead (esta entrega):

| Jornada | Status envolvidos |
|---|---|
| J1 Cadastro | novo |
| J2 / JL3 Qualificação e preferências | em_atendimento, preferencias_definidas |
| JL4 Seleção | selecao_em_preparacao, imoveis_enviados, avaliando_imoveis |
| JL6 Visita | visita_solicitada, visita_agendada, visitando_imoveis |
| JL5 / JL7 Prioridade e decisão | imovel_prioritario, aguardando_decisao |
| JL8 Conversão | convertida_em_cliente (só pela ação de conversão) |
| Encerramento | perdida, reativar_futuro |

Fase de cliente (pós-conversão; jornadas J5, J6 e J8 seguem válidas para documentos, simulação e negociação, agora sobre uma lead já convertida).
