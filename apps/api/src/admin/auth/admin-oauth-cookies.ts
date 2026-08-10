import "@fastify/cookie";
import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PedidoOAuth } from "../../auth/oauth-cookies";

export const ADMIN_OAUTH_COOKIE = "nexlar_admin_oauth";

/** O tempo de ida ao Google e volta. Curto: nada aqui precisa durar. */
const IDA_E_VOLTA_S = 10 * 60;

/**
 * State e nonce do fluxo Google DO ADMIN, no molde do OAuthCookies do
 * corretor. É classe separada, e não a mesma com outro nome de cookie,
 * pela mesma razão de todo o resto do módulo: os dois universos não
 * compartilham credencial nem por engano, e o path restringe o cookie às
 * rotas administrativas.
 *
 * Não existe cookie de cadastro aqui: no Admin o Google nunca cadastra.
 */
@Injectable()
export class AdminOAuthCookies {
  constructor(private readonly config: ConfigService) {}

  private get producao(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }

  abrirPedido(reply: FastifyReply): PedidoOAuth {
    const pedido: PedidoOAuth = {
      state: randomBytes(32).toString("base64url"),
      nonce: randomBytes(32).toString("base64url"),
    };
    reply.setCookie(
      ADMIN_OAUTH_COOKIE,
      `${pedido.state}.${pedido.nonce}`,
      this.opcoes(),
    );
    return pedido;
  }

  lerPedido(request: FastifyRequest): PedidoOAuth | null {
    const bruto = request.cookies?.[ADMIN_OAUTH_COOKIE];
    if (!bruto) return null;
    const [state, nonce] = bruto.split(".");
    if (!state || !nonce) return null;
    return { state, nonce };
  }

  fecharPedido(reply: FastifyReply): void {
    reply.clearCookie(ADMIN_OAUTH_COOKIE, { ...this.opcoes(), maxAge: 0 });
  }

  private opcoes() {
    return {
      httpOnly: true,
      secure: this.producao,
      // Lax é obrigatório: a volta do Google é navegação de topo vinda de
      // outro site, e Strict não mandaria o cookie.
      sameSite: "lax" as const,
      path: "/api/admin/auth",
      maxAge: IDA_E_VOLTA_S,
    };
  }
}
