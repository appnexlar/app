// O import traz a tipagem que o plugin acrescenta ao request e ao reply.
import "@fastify/cookie";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { durationToSeconds } from "./token.service";

export const REFRESH_COOKIE = "nexlar_refresh";

/**
 * O refresh token mora num cookie que o JavaScript não enxerga.
 *
 * Por que: ele é a credencial que interessa a um ataque, porque vale 30 dias e
 * se renova sozinha. No localStorage, qualquer script injetado por XSS a lia e
 * levava embora. Como cookie httpOnly, nem o nosso próprio código consegue ler.
 *
 * O access token continua em memória e viajando no cabeçalho Authorization, de
 * propósito: como ele não é cookie, uma requisição disparada por outro site não
 * consegue se autenticar sozinha, e a API inteira fica fora do alcance de CSRF
 * sem precisar de token anti-CSRF em toda rota. A única rota que confia em
 * cookie é a de renovação, e ali o SameSite faz esse trabalho.
 */
@Injectable()
export class SessionCookie {
  constructor(private readonly config: ConfigService) {}

  private get producao(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }

  set(reply: FastifyReply, refreshToken: string): void {
    reply.setCookie(REFRESH_COOKIE, refreshToken, this.opcoes());
  }

  /** Lê o token do cookie. Ausente significa "sem sessão", não erro. */
  read(request: FastifyRequest): string | null {
    return request.cookies?.[REFRESH_COOKIE] ?? null;
  }

  /**
   * Apaga o cookie. As opções precisam bater com as da criação (mesmo path e
   * sameSite), senão o navegador entende que é outro cookie e o antigo fica.
   */
  clear(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE, { ...this.opcoes(), maxAge: 0 });
  }

  private opcoes() {
    return {
      httpOnly: true,
      // Em desenvolvimento o app roda em http, e o navegador simplesmente
      // ignora cookie Secure em http. Em produção é obrigatório.
      secure: this.producao,
      // Lax basta: bloqueia o envio em requisição disparada por outro site,
      // que é o vetor de CSRF, sem quebrar a navegação normal de quem chega
      // por um link de e-mail.
      sameSite: "lax" as const,
      // Só as rotas de autenticação recebem o cookie. Com Path=/ ele
      // acompanharia toda requisição da origem, incluindo imagem e script, sem
      // nenhuma delas precisar dele. Quem usa é renovar, sair e redefinir
      // senha, e as três moram aqui.
      path: "/api/auth",
      maxAge: durationToSeconds(this.config.get<string>("JWT_REFRESH_TTL", "30d")),
    };
  }
}
