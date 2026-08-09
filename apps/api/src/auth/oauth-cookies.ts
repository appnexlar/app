import "@fastify/cookie";
import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Guarda o pedido em andamento e o convite de cadastro entre os dois saltos. */

export const OAUTH_COOKIE = "nexlar_oauth";
export const CADASTRO_COOKIE = "nexlar_cadastro";

/** O tempo de ida ao Google e volta. Curto: nada aqui precisa durar. */
const IDA_E_VOLTA_S = 10 * 60;

/** Prazo para concluir o cadastro depois de voltar do Google. */
export const CADASTRO_TTL_S = 30 * 60;

export interface PedidoOAuth {
  state: string;
  nonce: string;
}

@Injectable()
export class OAuthCookies {
  constructor(private readonly config: ConfigService) {}

  private get producao(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }

  /**
   * Abre um pedido: sorteia state e nonce e guarda os dois no navegador.
   *
   * O state é o que impede o ataque clássico do OAuth: sem ele, alguém começa
   * um fluxo com a própria conta Google, guarda o link de retorno e faz a
   * vítima abri-lo, deixando a vítima logada numa conta que não é dela. Como o
   * state que volta na URL tem que bater com o que está neste cookie, um
   * retorno que a vítima não começou não passa.
   */
  abrirPedido(reply: FastifyReply): PedidoOAuth {
    const pedido: PedidoOAuth = {
      state: randomBytes(32).toString("base64url"),
      nonce: randomBytes(32).toString("base64url"),
    };
    reply.setCookie(
      OAUTH_COOKIE,
      `${pedido.state}.${pedido.nonce}`,
      this.opcoes(IDA_E_VOLTA_S),
    );
    return pedido;
  }

  /** Lê o pedido aberto. Null quando não existe ou está malformado. */
  lerPedido(request: FastifyRequest): PedidoOAuth | null {
    const bruto = request.cookies?.[OAUTH_COOKIE];
    if (!bruto) return null;
    const [state, nonce] = bruto.split(".");
    if (!state || !nonce) return null;
    return { state, nonce };
  }

  /** O pedido é de uso único: some assim que o retorno é processado. */
  fecharPedido(reply: FastifyReply): void {
    reply.clearCookie(OAUTH_COOKIE, { ...this.opcoes(IDA_E_VOLTA_S), maxAge: 0 });
  }

  /**
   * Guarda o convite de cadastro (um JWT curto assinado pelo servidor).
   *
   * Fica em cookie, e não na URL, por dois motivos: o endereço não vira uma
   * sopa de letras que a Rafaelle já pediu para não existir, e o convite não
   * sobra no histórico nem no Referer de quem abrir um link a partir da tela.
   */
  guardarCadastro(reply: FastifyReply, ticket: string): void {
    reply.setCookie(CADASTRO_COOKIE, ticket, this.opcoes(CADASTRO_TTL_S));
  }

  lerCadastro(request: FastifyRequest): string | null {
    return request.cookies?.[CADASTRO_COOKIE] ?? null;
  }

  limparCadastro(reply: FastifyReply): void {
    reply.clearCookie(CADASTRO_COOKIE, { ...this.opcoes(CADASTRO_TTL_S), maxAge: 0 });
  }

  /** Mesmo molde do cookie de sessão: httpOnly, Secure em produção, Lax. */
  private opcoes(maxAge: number) {
    return {
      httpOnly: true,
      secure: this.producao,
      // Lax é obrigatório aqui, não uma escolha: a volta do Google é uma
      // navegação de topo vinda de outro site, e com Strict o navegador não
      // mandaria o cookie, quebrando o fluxo inteiro.
      sameSite: "lax" as const,
      path: "/api/auth",
      maxAge,
    };
  }
}
