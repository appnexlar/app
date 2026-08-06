/**
 * Modelos dos e-mails transacionais. HTML de e-mail não é HTML de site:
 * cliente de e-mail ignora folha de estilo externa e flexbox, então tudo é
 * tabela e estilo na própria tag. Cada e-mail leva também uma versão em texto
 * puro, que é o que aparece em leitor de tela e em cliente antigo.
 *
 * O endereço completo, com o token, não aparece escrito na versão HTML: é uma
 * parede de caracteres no meio do e-mail, e assusta mais do que ajuda. A
 * alternativa ao botão é um segundo link, curto, para o caso de o cliente de
 * e-mail estragar o botão em tabela. Quem não renderiza HTML nenhum recebe a
 * versão em texto puro, e lá o endereço completo continua, porque ali ele é
 * a única forma de chegar.
 */

const LARANJA = "#d2502e";
const NAVY = "#1c2c39";
const TEXTO = "#22211f";
const TEXTO_SUAVE = "#78756f";
const BORDA = "#e2dfdb";
const FUNDO = "#fafaf8";
/**
 * Cliente de e-mail não carrega fonte externa de forma confiável, e sem
 * família declarada muitos caem no serifado padrão. A pilha abaixo pega a
 * fonte de sistema, que é o mais perto do app em cada aparelho.
 */
const FONTE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

interface Corpo {
  titulo: string;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  rodape?: string;
}

/** Esqueleto comum: marca no topo, conteúdo no meio, aviso discreto embaixo. */
function layout({ titulo, paragrafos, botao, rodape }: Corpo): string {
  const corpo = paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONTE};font-size:16px;line-height:1.6;color:${TEXTO};">${p}</p>`,
    )
    .join("");

  const acao = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
         <tr><td style="border-radius:12px;background:${LARANJA};">
           <a href="${botao.url}" style="display:inline-block;padding:14px 28px;font-family:${FONTE};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">${botao.texto}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 24px;font-family:${FONTE};font-size:13px;line-height:1.6;color:${TEXTO_SUAVE};">
         Se o botão não funcionar,
         <a href="${botao.url}" style="color:${LARANJA};font-weight:600;">abra por este link</a>.
       </p>`
    : "";

  const aviso = rodape
    ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${BORDA};font-family:${FONTE};font-size:13px;line-height:1.6;color:${TEXTO_SUAVE};">${rodape}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:${FUNDO};font-family:${FONTE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDA};border-radius:16px;">
        <tr><td style="padding:32px 32px 0;">
          <span style="font-family:${FONTE};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${NAVY};">nex<span style="color:${LARANJA};">lar</span></span>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <h1 style="margin:0 0 16px;font-family:${FONTE};font-size:24px;line-height:1.3;color:${TEXTO};">${titulo}</h1>
          ${corpo}
          ${acao}
          ${aviso}
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-family:${FONTE};font-size:12px;color:${TEXTO_SUAVE};">Nexlar, gestão para corretores</p>
    </td></tr>
  </table>
</body></html>`;
}

export interface Mensagem {
  subject: string;
  html: string;
  text: string;
}

export function passwordResetTemplate(fullName: string, resetUrl: string): Mensagem {
  const primeiroNome = fullName.split(" ")[0];
  return {
    subject: "Redefinir sua senha do Nexlar",
    html: layout({
      titulo: "Redefinir sua senha",
      paragrafos: [
        `Olá, ${primeiroNome}.`,
        "Recebemos um pedido para criar uma nova senha da sua conta. É só clicar no botão abaixo.",
      ],
      botao: { texto: "Criar nova senha", url: resetUrl },
      rodape:
        "Este link vale por 1 hora e só pode ser usado uma vez. " +
        "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
    }),
    text: [
      `Olá, ${primeiroNome}.`,
      "",
      "Recebemos um pedido para criar uma nova senha da sua conta do Nexlar.",
      "Abra o endereço abaixo para continuar:",
      resetUrl,
      "",
      "Este link vale por 1 hora e só pode ser usado uma vez.",
      "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.",
    ].join("\n"),
  };
}

export function emailVerificationTemplate(fullName: string, verifyUrl: string): Mensagem {
  const primeiroNome = fullName.split(" ")[0];
  return {
    subject: "Confirme seu e-mail para começar no Nexlar",
    html: layout({
      titulo: "Confirme seu e-mail",
      paragrafos: [
        `Olá, ${primeiroNome}.`,
        "Falta um passo para sua conta ficar pronta. Confirmar o e-mail é o que garante que só você recupera o acesso se esquecer a senha.",
      ],
      botao: { texto: "Confirmar meu e-mail", url: verifyUrl },
      rodape:
        "Este link vale por 7 dias e só pode ser usado uma vez. " +
        "Se não foi você que criou esta conta, ignore este e-mail.",
    }),
    text: [
      `Olá, ${primeiroNome}.`,
      "",
      "Falta um passo para sua conta do Nexlar ficar pronta.",
      "Abra o endereço abaixo para confirmar seu e-mail:",
      verifyUrl,
      "",
      "Este link vale por 7 dias e só pode ser usado uma vez.",
      "Se não foi você que criou esta conta, ignore este e-mail.",
    ].join("\n"),
  };
}

export function financingAccessCodeTemplate(
  firstName: string,
  brokerName: string,
  code: string,
): Mensagem {
  // O código vai grande e em texto, não em botão: a pessoa vai digitá-lo na
  // tela que já está aberta, não clicar. Espaço entre os dígitos ajuda a ler.
  const codigoFormatado = code.split("").join(" ");
  return {
    subject: `${code} é seu código de acesso`,
    html: layout({
      titulo: "Seu código de acesso",
      paragrafos: [
        `Olá, ${firstName}.`,
        `Use o código abaixo para abrir o formulário de dados que ${brokerName} enviou para você:`,
        `<span style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;color:#1c2c39;">${codigoFormatado}</span>`,
      ],
      rodape:
        "O código vale por 10 minutos e só funciona no link que você recebeu. " +
        "Se não foi você que pediu, ignore este e-mail.",
    }),
    text: [
      `Olá, ${firstName}.`,
      "",
      `Seu código de acesso ao formulário enviado por ${brokerName}:`,
      code,
      "",
      "O código vale por 10 minutos e só funciona no link que você recebeu.",
      "Se não foi você que pediu, ignore este e-mail.",
    ].join("\n"),
  };
}

export function welcomeTemplate(fullName: string, appUrl: string): Mensagem {
  const primeiroNome = fullName.split(" ")[0];
  return {
    subject: "Bem-vindo ao Nexlar",
    html: layout({
      titulo: `Bem-vindo, ${primeiroNome}`,
      paragrafos: [
        "Sua conta está criada. O Nexlar organiza seus leads, seus imóveis e sua agenda num lugar só, e mostra qual é a próxima ação de cada atendimento.",
        "Comece cadastrando sua primeira lead. Só o nome e o WhatsApp são obrigatórios.",
      ],
      botao: { texto: "Abrir o Nexlar", url: appUrl },
    }),
    text: [
      `Bem-vindo, ${primeiroNome}.`,
      "",
      "Sua conta do Nexlar está criada. Comece cadastrando sua primeira lead:",
      appUrl,
      "",
      "Só o nome e o WhatsApp são obrigatórios.",
    ].join("\n"),
  };
}
