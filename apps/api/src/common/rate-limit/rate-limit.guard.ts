import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { RATE_LIMIT_KEY, type RateLimitRule } from "./rate-limit.decorator";
import { RateLimitStore, formatWait } from "./rate-limit.store";

/**
 * Aplica a regra do @RateLimit por IP. Rota sem o decorator passa direto:
 * o limite é explícito onde importa, e não um teto global que poderia
 * derrubar o app inteiro se o IP do cliente for lido errado atrás do proxy.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /**
   * Em produção sem proxy declarado, o IP de todo mundo é o do proxy: contar
   * por IP prenderia o app inteiro. Nesse caso a trava grossa fica de fora e
   * sobra a fina, por conta, que não depende de IP nenhum.
   */
  private readonly ipConfiavel: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
    config: ConfigService,
  ) {
    const hops = Number(config.get<number>("TRUST_PROXY_HOPS", 0));
    const producao = config.get<string>("NODE_ENV") === "production";
    this.ipConfiavel = !producao || hops > 0;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.ipConfiavel) return true;

    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!rule) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const bucket = this.store.hit(`${rule.name}:${request.ip}`, rule.windowMs);

    if (bucket.count > rule.limit) {
      const seconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
      http.getResponse<FastifyReply>().header("Retry-After", String(seconds));
      throw new HttpException(
        `Muitas tentativas. Tente novamente em ${formatWait(seconds)}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
