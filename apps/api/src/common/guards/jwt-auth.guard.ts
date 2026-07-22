import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { FastifyRequest } from "fastify";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AuthenticatedBroker } from "../decorators/current-broker.decorator";

interface AccessTokenPayload {
  sub: string;
  exp: number;
}

/**
 * Guard global de autenticação. Verifica o access token JWT em toda rota,
 * exceto as marcadas com @Public(), e disponibiliza o broker_id do token
 * (nunca do payload da requisição) para os módulos de domínio.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { broker?: AuthenticatedBroker }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Autenticação necessária");
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      request.broker = { brokerId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Sessão expirada ou inválida");
    }
  }

  private extractToken(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [type, value] = header.split(" ");
    return type === "Bearer" && value ? value : null;
  }
}
