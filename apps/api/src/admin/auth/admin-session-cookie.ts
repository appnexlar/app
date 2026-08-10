import "@fastify/cookie";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";

export const ADMIN_REFRESH_COOKIE = "nexlar_admin_refresh";

/**
 * Cookie da sessão administrativa. Mesmo raciocínio do SessionCookie do
 * corretor (httpOnly, Secure em produção, Lax), com o path restrito às
 * rotas de autenticação DO ADMIN: nenhuma outra requisição da origem carrega
 * esta credencial, nem as do próprio corretor.
 */
@Injectable()
export class AdminSessionCookie {
  constructor(private readonly config: ConfigService) {}

  private get producao(): boolean {
    return this.config.get<string>("NODE_ENV") === "production";
  }

  set(reply: FastifyReply, refreshToken: string): void {
    reply.setCookie(ADMIN_REFRESH_COOKIE, refreshToken, this.opcoes());
  }

  read(request: FastifyRequest): string | null {
    return request.cookies?.[ADMIN_REFRESH_COOKIE] ?? null;
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(ADMIN_REFRESH_COOKIE, { ...this.opcoes(), maxAge: 0 });
  }

  private opcoes() {
    return {
      httpOnly: true,
      secure: this.producao,
      sameSite: "lax" as const,
      path: "/api/admin/auth",
      // O maxAge do cookie acompanha o teto da sessão; quem manda de verdade
      // é o expires_at no banco, este aqui só evita cookie morto no navegador.
      maxAge: 8 * 60 * 60,
    };
  }
}
