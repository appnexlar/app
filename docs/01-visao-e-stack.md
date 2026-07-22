# 01: Visão, personas e stack

## 1.1 O problema

O corretor capta muito lead por TikTok, Instagram e indicação, e conduz tudo pelo WhatsApp. O atendimento fica espalhado entre conversas, anotações soltas e memória. O resultado é perda de oportunidade: contatos que nunca entram num funil claro, clientes que ficam sem follow-up, documentos que se perdem e nenhuma visão de esforço contra retorno.

A dor central não é cadastrar cliente. É conduzir cada lead até a próxima ação certa e nunca deixar um contato importante esfriar.

## 1.2 A solução (MVP)

Uma plataforma web simples para o corretor centralizar a operação comercial. Cada lead entra num funil visual, ganha uma ficha com histórico, uma próxima ação com data, documentos organizados por etapa e um lugar para registrar visitas e simulações. O dashboard mostra onde estão os leads e o que está parado.

O princípio que guia cada decisão de produto: no uso diário, o Nexlar precisa ser mais rápido que a planilha e o WhatsApp. Se virar burocracia, o corretor não usa.

## 1.3 Personas

**Camila, corretora autônoma.** Capta por Instagram e TikTok, atende no WhatsApp, trabalha sozinha. Vive no celular, entre visitas. Precisa registrar um lead novo em menos de trinta segundos e saber, ao abrir o app de manhã, quem ela precisa contatar hoje.

**Rogério, corretor vinculado a imobiliária.** Tem carteira própria além dos leads da imobiliária. Quer gestão individual mais eficiente sem depender do sistema da empresa. Usa a plataforma como ferramenta pessoal.

**Beatriz, corretora com foco em cliente no exterior.** Atende brasileiros que moram fora e compram imóvel no Brasil. Os casos são mais longos e exigem mais documentação (tradução juramentada, comprovações, etapas bancárias). Precisa de checklist de documentos por etapa e de não perder o fio de casos que levam meses.

O MVP é single-user por corretor. Não há visão de imobiliária nem distribuição de leads entre pessoas nesta fase. O modelo de dados já nasce preparado para multiusuário (ver 1.6), mas a interface e as regras do MVP tratam um corretor por conta.

## 1.4 Princípios de produto

Baixo atrito no uso diário. O cadastro rápido de lead é a tela mais importante do produto e precisa ser instantânea. Tudo que não for essencial no primeiro contato fica para a etapa de análise.

Escopo controlado. O MVP valida adoção. Onde a integração é cara ou instável (simulação bancária), começamos com atalho e registro manual, não com integração automática.

Mobile-first. O corretor trabalha no celular. Toda tela precisa funcionar bem em telas pequenas antes de pensar em desktop.

## 1.5 Stack

O Nexlar é um produto comercial e nasce com as três camadas separadas: frontend, backend próprio e banco. A arquitetura completa, com as justificativas de cada escolha, está em `docs/06-arquitetura-tecnica.md`, que é o documento oficial dessa camada. O resumo:

**Frontend:** React com Vite e TypeScript. Tailwind CSS para estilo. React Router para navegação. TanStack Query para dados do servidor. React Hook Form com Zod para formulários e validação.

**Backend:** API REST em Node.js com TypeScript, usando NestJS e Prisma. Toda regra de negócio, autenticação (JWT próprio) e autorização por dono vivem aqui.

**Banco:** PostgreSQL 16, gerenciado, com migrações versionadas via Prisma.

**Storage de documentos:** bucket privado S3-compatível (S3 ou Cloudflare R2), com URLs assinadas geradas pela API.

**Hospedagem:** front em CDN (Vercel/Cloudflare Pages), API em container (Railway/Render/Fly.io), Postgres gerenciado.

## 1.6 Arquitetura (visão de um parágrafo)

O front é uma SPA que consome exclusivamente a API. A API concentra validação, regras de negócio, timeline e o isolamento de dados por corretor: toda tabela de negócio carrega `broker_id`, e a API garante que cada corretor só lê e escreve os próprios registros, com o id vindo sempre do token autenticado, nunca do cliente. Essa coluna é o gancho que, na fase de imobiliária, vira o ponto de compartilhamento de carteira. O diagrama e os detalhes estão em `docs/06`.

Estados de tela: a aplicação sempre trata os quatro estados de carregamento de dados, carregando, vazio, erro e sucesso. O estado vazio de cada lista precisa ter texto e ação claros, porque um corretor novo começa com tudo vazio.

## 1.7 Identidade visual (direção inicial)

Interface limpa, com foco em legibilidade e toque. Cor primária sugerida em tom de azul confiável para ações e destaques, com neutros de cinza para estrutura, verde para sucesso/fechado, âmbar para atenção (leads parados) e vermelho para perdido/recusado. Tipografia sem serifa. Componentes com cantos suaves e alvos de toque generosos. Isso é ponto de partida, não trava: o cliente pode ajustar a identidade depois sem afetar as jornadas.
