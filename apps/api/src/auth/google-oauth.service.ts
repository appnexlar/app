import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { request } from "undici";

/**
 * Conversa com o Google no fluxo de código de autorização (OpenID Connect).
 *
 * Por que o código e não o id_token direto no navegador: no fluxo implícito o
 * token passa pela barra de endereços, fica no histórico e no Referer. Aqui o
 * navegador só carrega um código de uso único e curtíssimo, e quem o troca por
 * identidade é o servidor, autenticado com o client_secret. Um código
 * interceptado sozinho não vale nada.
 *
 * Sobre não verificar a assinatura do id_token: ele não chega pelo navegador,
 * chega na resposta do endpoint de token do Google, por TLS, numa conexão que
 * nós abrimos e cujo certificado validamos. O OpenID Connect Core §3.1.3.7
 * dispensa a checagem de assinatura exatamente nesse caso. As claims continuam
 * todas conferidas abaixo, que é o que de fato protege.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EMISSORES = ["accounts.google.com", "https://accounts.google.com"];

/** Tolerância de relógio entre a nossa máquina e a do Google. */
const FOLGA_RELOGIO_S = 60;

/** O que o Google nos conta sobre a pessoa, já conferido. */
export interface GoogleIdentity {
  /** Claim `sub`: identificador estável da conta Google. */
  googleId: string;
  email: string;
  fullName: string;
}

/** Falha do lado do Google ou de conferência. O motivo fica no servidor. */
export class GoogleAuthError extends Error {
  constructor(readonly motivo: GoogleAuthFailure) {
    super(`google_${motivo}`);
    this.name = "GoogleAuthError";
  }
}

export type GoogleAuthFailure =
  | "desligado"
  | "troca_recusada"
  | "resposta_invalida"
  | "claims_invalidas"
  | "email_nao_verificado";

@Injectable()
export class GoogleOAuthService {
  constructor(private readonly config: ConfigService) {}

  private get clientId(): string {
    return this.config.get<string>("GOOGLE_CLIENT_ID", "");
  }

  private get clientSecret(): string {
    return this.config.get<string>("GOOGLE_CLIENT_SECRET", "");
  }

  /** Sem credencial configurada o recurso inteiro fica fora do ar. */
  get enabled(): boolean {
    return this.clientId !== "" && this.clientSecret !== "";
  }

  /**
   * Para onde o Google devolve a pessoa. Sai do WEB_APP_URL, e não da URL da
   * API, porque em produção o front é a origem pública e o `/api` chega lá por
   * reescrita. Assim os cookies da autenticação continuam sendo do site que a
   * pessoa está vendo, e o endereço cadastrado no Google Cloud é um só.
   */
  get redirectUri(): string {
    return this.redirectUriPara("/api/auth/google/callback");
  }

  /**
   * O mesmo endereço-base para outro caminho de retorno. Existe porque o
   * Nexlar Admin tem o próprio callback: o Google exige que autorização e
   * troca de código usem o MESMO redirect_uri, então quem começa o fluxo
   * escolhe o caminho e o carrega até o fim.
   */
  redirectUriPara(caminho: string): string {
    const base = this.config.get<string>("WEB_APP_URL", "http://localhost:5173");
    return `${base.replace(/\/$/, "")}${caminho}`;
  }

  /** URL para onde o navegador é mandado no começo do fluxo. */
  authorizationUrl(params: { state: string; nonce: string; redirectUri?: string }): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri ?? this.redirectUri);
    url.searchParams.set("response_type", "code");
    // O mínimo: quem é e como se chama. Nada de agenda, contatos ou arquivos.
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", params.state);
    url.searchParams.set("nonce", params.nonce);
    // Sempre perguntar qual conta usar. Quem tem a conta pessoal e a da
    // imobiliária no mesmo navegador escolheria errado em silêncio.
    url.searchParams.set("prompt", "select_account");
    // Não pedimos refresh token: a sessão do Nexlar é nossa, e o acesso ao
    // Google acaba assim que a identidade é confirmada.
    url.searchParams.set("access_type", "online");
    return url.toString();
  }

  /**
   * Troca o código pela identidade. Junta as duas etapas de propósito: o
   * id_token não deve circular pelo resto do sistema, só o resultado conferido.
   */
  async identify(
    code: string,
    nonceEsperado: string,
    redirectUri?: string,
  ): Promise<GoogleIdentity> {
    if (!this.enabled) throw new GoogleAuthError("desligado");

    const corpo = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri ?? this.redirectUri,
      grant_type: "authorization_code",
    });

    const resposta = await request(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });

    if (resposta.statusCode !== 200) {
      // O corpo do erro do Google pode trazer detalhe de configuração nossa.
      // Ele morre aqui: quem chamou recebe só o motivo genérico.
      await resposta.body.text().catch(() => "");
      throw new GoogleAuthError("troca_recusada");
    }

    const json = (await resposta.body.json().catch(() => null)) as {
      id_token?: unknown;
    } | null;

    const idToken = json?.id_token;
    if (typeof idToken !== "string" || idToken === "") {
      throw new GoogleAuthError("resposta_invalida");
    }

    return this.lerClaims(idToken, nonceEsperado);
  }

  /** Confere emissor, destinatário, validade, nonce e e-mail. */
  private lerClaims(idToken: string, nonceEsperado: string): GoogleIdentity {
    const claims = decodificarPayload(idToken);
    if (!claims) throw new GoogleAuthError("resposta_invalida");

    const agora = Math.floor(Date.now() / 1000);
    const emissorOk = typeof claims.iss === "string" && EMISSORES.includes(claims.iss);
    // aud precisa ser o NOSSO client_id: sem isso, um id_token emitido para
    // qualquer outro aplicativo Google serviria para entrar aqui.
    const destinoOk = claims.aud === this.clientId;
    const validadeOk = typeof claims.exp === "number" && claims.exp + FOLGA_RELOGIO_S > agora;
    // O nonce amarra este id_token ao pedido que este navegador começou.
    const nonceOk = typeof claims.nonce === "string" && seguroIgual(claims.nonce, nonceEsperado);
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";

    if (!emissorOk || !destinoOk || !validadeOk || !nonceOk || !sub || !email) {
      throw new GoogleAuthError("claims_invalidas");
    }

    // Sem esta checagem, alguém com um domínio próprio ligado ao Google poderia
    // criar uma conta com o e-mail de outra pessoa e, no primeiro login, o
    // vínculo por e-mail entregaria a conta do Nexlar de bandeja.
    if (claims.email_verified !== true) {
      throw new GoogleAuthError("email_nao_verificado");
    }

    const nome = typeof claims.name === "string" ? claims.name.trim() : "";
    return { googleId: sub, email, fullName: nome || email.split("@")[0] };
  }
}

/** Lê o payload do JWT sem validar assinatura (ver comentário do topo). */
function decodificarPayload(idToken: string): Record<string, unknown> | null {
  const partes = idToken.split(".");
  if (partes.length !== 3) return null;
  try {
    const json = Buffer.from(partes[1], "base64url").toString("utf8");
    const valor: unknown = JSON.parse(json);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    return valor as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Comparação em tempo constante, para o nonce não vazar por medida de tempo. */
function seguroIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}
