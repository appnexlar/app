# Entrar com o Google: credencial e migration

Dois roteiros para você rodar. O primeiro é no Google Cloud e destrava o teste
local. O segundo é a migration de produção, e só vale depois que você aprovar a
subida. Quem roda é você: o agente não escreve no banco de produção nem entra
em painel com a sua conta.

Enquanto o `GOOGLE_CLIENT_ID` não existir, o recurso fica **desligado por
inteiro**: as rotas `/api/auth/google` respondem 404. Isso é proposital. Meia
credencial faria a tela parecer pronta e quebrar no clique.

**A tela sabe disso sozinha.** Ela pergunta a `GET /api/auth/providers` quais
portas existem e, sem credencial, mostra o botão do Google **desabilitado**,
com a frase "chega em breve" embaixo. Quem quiser entrar usa o e-mail, que
segue funcionando normalmente. Por isso dá para subir esta versão para
produção antes de criar a credencial: nada aparece quebrado.

Quando você colar as variáveis, o botão liga sozinho na próxima carga da
página. **Não precisa publicar o site de novo**, porque quem decide é a API.

## Parte 1: criar a credencial no Google Cloud

Leva uns dez minutos. Você vai sair daqui com dois valores: um **Client ID**
(público) e um **Client Secret** (segredo, nunca me mande pelo chat).

### 1. Projeto

Abra [console.cloud.google.com](https://console.cloud.google.com). No seletor de
projeto no topo, crie um projeto chamado **Nexlar**, ou use um que já exista.

### 2. Tela de consentimento

Menu **APIs e serviços → Tela de permissão OAuth**.

| Campo | O que pôr |
|---|---|
| Tipo de usuário | **Externo** |
| Nome do app | Nexlar |
| E-mail de suporte | nexlarsystem@gmail.com |
| Domínio do app | `https://nexlar.app` |
| Link da política de privacidade | `https://nexlar.app/privacidade` |
| Link dos termos | `https://nexlar.app/termos` |
| Domínio autorizado | `nexlar.app` |
| E-mail do desenvolvedor | nexlarsystem@gmail.com |

Entre no Google Cloud com **nexlarsystem@gmail.com**, a mesma conta que hoje é
dona do GitHub, da Vercel, da Railway, do Supabase e do Resend. Foi por isso que
a credencial ficou para o fim da migração: criá-la na conta antiga seria repetir
o problema que acabamos de resolver.

Nos **escopos**, adicione só três: `openid`, `.../auth/userinfo.email` e
`.../auth/userinfo.profile`. São exatamente os que a API pede, e nenhum deles é
escopo sensível, então **não há verificação do Google a fazer**. Se aparecer
qualquer coisa sobre agenda, contatos ou Drive, é escopo a mais: tire.

O app pode ficar em **Teste** enquanto só você e as pessoas que você cadastrar
como usuários de teste vão entrar. Para abrir ao público, clique em
**Publicar app** nessa mesma tela. Em modo Teste, quem não estiver na lista de
testadores leva um erro do próprio Google antes de chegar no Nexlar.

### 3. As credenciais

Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.

- Tipo de aplicativo: **Aplicativo da Web**
- Nome: `Nexlar Web`

**Origens JavaScript autorizadas** (as duas):

```
http://localhost:5173
https://nexlar.app
```

**URIs de redirecionamento autorizados** (as duas, exatamente assim):

```
http://localhost:5173/api/auth/google/callback
https://nexlar.app/api/auth/google/callback
```

O endereço de retorno sai do site, e não da API, porque em produção o `/api` do
nexlar.app é reescrito para a Railway pela Vercel. Assim os cookies da
autenticação continuam sendo do site que a pessoa está vendo, e existe um só
endereço para cadastrar. O Google compara caractere por caractere: barra a mais
no fim já derruba o fluxo com `redirect_uri_mismatch`.

Ao salvar, o Google mostra o **Client ID** e o **Client Secret**. Copie os dois.

### As duas armadilhas desta tela

Aconteceram as duas em 9 ago 2026, e as duas custaram uma volta inteira de deploy.

**Os campos são parecidos e fáceis de trocar.** "Authorized JavaScript origins"
aceita só domínio e porta. Os endereços com `/api/auth/google/callback` vão em
"Authorized redirect URIs", que fica logo abaixo. Trocar dá
`Error 400: redirect_uri_mismatch` na tela do Google.

**O Client Secret aparece mascarado como `****9Vpr`.** Selecionar esse texto com
o mouse copia a máscara. Use o **ícone de copiar** ao lado do valor, ou o de
download. Um secret errado passa despercebido até o fim do fluxo, porque a API
esconde o motivo e devolve só `?erro=google`.

Quando o login falhar e não houver log, pergunte ao próprio Google com um código
falso. As variáveis vêm do serviço e não aparecem na tela:

```bash
railway run --service "@nexlar/api" -- node -e '
const b=new URLSearchParams({code:"codigo-falso",client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:process.env.WEB_APP_URL+"/api/auth/google/callback",grant_type:"authorization_code"});
fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:b.toString()})
.then(r=>r.json().then(j=>console.log(r.status,j.error,j.error_description)))'
```

`invalid_client` é secret errado. `invalid_grant: Malformed auth code` significa
que a credencial está boa e o Google só reclamou do código falso.

### 4. Ligar no ambiente local

No arquivo `apps/api/.env` (que não vai para o git), acrescente:

```
GOOGLE_CLIENT_ID=cole-aqui-o-client-id
GOOGLE_CLIENT_SECRET=cole-aqui-o-client-secret
```

Reinicie a API. Um jeito rápido de conferir que ligou:

```bash
curl -si http://localhost:3333/api/auth/google | head -3
```

Desligado responde `HTTP/1.1 404`. Ligado responde `HTTP/1.1 302` com um
`location:` para `accounts.google.com`. Aí é só abrir
`http://localhost:5173/login` e clicar em **Continuar com o Google**.

### 5. O que testar

1. **Conta nova**: entre com um Gmail que ainda não existe no Nexlar. Você deve
   voltar em `/criar-conta` já com seu nome e e-mail no topo, aceitar os Termos,
   preencher o perfil e concluir. A conta entra direto no painel, **sem passar
   pela tela de confirmar e-mail**.
2. **Voltar depois**: saia e entre de novo pelo Google. Vai direto para o painel.
3. **Conta antiga**: com uma conta que já existe por senha, entre pelo Google
   usando o mesmo e-mail. Ela deve ser vinculada e entrar, e a senha antiga
   continua funcionando.
4. **Cancelar**: na tela do Google, clique em cancelar. Você volta ao login com
   um aviso calmo, não com cara de erro.

## Parte 2: ligar em produção

**A migration já está aplicada.** O banco novo (`ajkinpzabeikdlsfnlnq`, criado na
migração de 9 ago) nasceu com as 26 migrations, esta inclusive, e o
`prisma migrate status` responde `Database schema is up to date!`. Não há nada a
rodar no banco. O resto desta parte fica como registro do que a migration fez.

Falta só levar as duas variáveis para a Railway, e para isso existe um script que
lê os valores às escuras, como o da senha do banco:

```bash
cd /Users/rafaelle/Documents/Projects2026/NEXLAR/apps/api && python3 scripts/preencher-credencial-do-google.py
```

Clique dentro do terminal antes de colar: o campo não mostra nada enquanto você
digita, e é aí que se cola na janela errada. Para o ambiente local, o mesmo
script com `--local` escreve no `apps/api/.env`.

Conferir depois que a Railway republicar (leva cerca de um minuto):

```bash
curl -s https://nexlar.app/api/auth/providers
```

Desligado responde `{"google":false}`. Ligado responde `{"google":true}`, e o
botão acende sozinho na próxima carga da página.

### O que a migration fez

| Migration | O que faz |
|---|---|
| `20260808150000_entrar_com_google` | `broker.password_hash` passa a aceitar NULL e entra a coluna `broker.google_id`, com índice único |

As duas mudanças são aditivas. Nenhuma linha existente é alterada, nenhuma conta
perde a senha e o login por e-mail continua igual. `NULL` não colide com `NULL`
no índice único do Postgres, então as contas de senha convivem sem problema.

### O serviço na Railway

O serviço se chama **`@nexlar/api`** (com a arroba, herdado do nome do workspace
no monorepo). As variáveis do Google não bloqueiam nada: sem elas o site sobe com
o botão desabilitado e o e-mail funcionando. Quando entram, a Railway reinicia o
serviço sozinha e o botão liga.

**Se o redeploy falhar com `Healthcheck failure`**, é o incidente de 5 ago: o Supabase
pausa projetos parados e o Prisma morre ao conectar. Abrir o painel do Supabase
e usar o projeto o traz de volta. O log real aparece assim:

```bash
railway deployment list --service "@nexlar/api"
```

## As duas portas de entrada

Tanto entrar quanto criar conta oferecem Google e e-mail, com o Google em
destaque. O que muda entre os dois caminhos:

| | Google | E-mail e senha |
|---|---|---|
| Etapa 1 do cadastro | identidade já preenchida, só os aceites | nome, e-mail, senha e aceites |
| Confirmação de e-mail | já vem confirmada pelo Google | link enviado, com o gate de sempre |
| Onde cai no fim | direto no painel | tela de confirmar e-mail |
| Senha no banco | nenhuma | hash Argon2id, como antes |

Etapas 2 a 4 (perfil, plano, confirmação) são idênticas nos dois. Quem decide
para onde a pessoa vai no fim é o servidor, pelo `emailVerified` da resposta, e
não o botão que ela clicou: assim o gate de confirmação continua fora do
alcance do navegador.
