# CLAUDE.md: Nexlar

Instruções para o agente que vai construir este projeto. Leia isto antes de escrever qualquer código.

## O que é

Nexlar é um CRM imobiliário enxuto para corretores organizarem leads de WhatsApp e redes sociais e conduzirem cada cliente até a próxima ação certa. A especificação completa está em `docs/`, na ordem numérica. Leia todos antes de começar:

1. `docs/01-visao-e-stack.md`: visão, personas, stack e arquitetura
2. `docs/02-modelo-de-dados.md`: entidades, campos, funil e telas
3. `docs/03-jornadas.md`: jornadas passo a passo com critérios de aceite
4. `docs/04-requisitos.md`: requisitos por módulo, LGPD e fora de escopo
5. `docs/05-guia-claude-code.md`: ordem de build e estrutura de pastas
6. `docs/06-arquitetura-tecnica.md`: arquitetura oficial (front, back, banco, storage, deploy)

## Stack

Monorepo pnpm. Front: React + Vite + TypeScript, Tailwind, React Router, TanStack Query, React Hook Form + Zod. Back: API REST em NestJS (Node + TypeScript, sobre Fastify) com Prisma. Banco: PostgreSQL 16. Documentos em bucket S3-compatível com URLs assinadas. Auth JWT própria (access + refresh, Argon2id). Detalhes e justificativas em `docs/06`.

## Regras que não se negociam

O cadastro rápido de lead é a tela mais importante. Só nome e WhatsApp são obrigatórios. Se ficar burocrático, o produto falha.

Tudo é mobile-first. O corretor trabalha no celular.

Isolamento por corretor aplicado pela API em toda leitura e escrita. O `broker_id` vem sempre do token autenticado, nunca do payload. Verifique com teste automatizado de dois corretores que um não vê o dado do outro.

Dados sensíveis (CPF, renda, documentos) exigem cuidado de LGPD: consentimento no cadastro do lead, bucket privado, exclusão que apaga o arquivo. Ver `docs/04`, seção NFR.

Toda tela trata quatro estados: carregando, vazio, erro, sucesso. Estado vazio sempre orienta o próximo passo.

Interface em português do Brasil, com datas e valores no formato brasileiro.

## Como construir

Em fatias verticais que já funcionam, na ordem dos marcos de `docs/05`. Não construa módulo isolado sem tela. Cada marco termina com os critérios de aceite das jornadas cobertas passando num teste manual roteirizado.

Escopo é só o core do MVP (Fase 1). Não construa página pública do corretor, formulário público, multiusuário ou integração bancária automática.

Exceção decidida em 23 jul 2026: a **verificação de CRECI** entrou no MVP, numa versão enxuta. Enviar o CRECI é opcional e não bloqueia nada; quem envia passa por conferência manual e ganha o selo de corretor verificado, que a lead vê na página pública do imóvel. Não há consulta automática ao COFECI, e isso continua fora de escopo. Esses itens estão listados como fora de escopo em `docs/04` e servem só para orientar decisões de arquitetura.

## Antes de dizer que terminou

Rode a definição de pronto de `docs/05`: quatro estados tratados, critérios de aceite verificados, teste de isolamento com dois corretores passando, e funcionamento no viewport de celular.
