import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { FastifyRequest } from "fastify";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ALLOW_UNVERIFIED_KEY } from "../decorators/allow-unverified.decorator";
import { AuthenticatedBroker } from "../decorators/current-broker.decorator";
import { PrismaService } from "../../prisma/prisma.service";

interface AccessTokenPayload {
  sub: string;
  exp: number;
}

/**
 * Códigos no corpo do erro. O front precisa distinguir "confirme o e-mail" e
 * "conta suspensa" de um 403 qualquer de regra de negócio, e comparar texto de
 * mensagem quebraria na primeira vez que alguém melhorasse a frase.
 */
export const CODIGO_EMAIL_NAO_CONFIRMADO = "email_nao_confirmado";
export const CODIGO_CONTA_SUSPENSA = "conta_suspensa";

/** Mensagens fixas, para o front reconhecer o caso sem depender de texto solto. */
export const EMAIL_NAO_CONFIRMADO =
  "Confirme seu e-mail para usar o Nextlar. Reenviamos o link se precisar.";
export const CONTA_SUSPENSA_GUARD =
  "Esta conta está suspensa. Fale com o suporte do Nextlar para reativar.";

/**
 * Guard global de autenticação. Verifica o access token JWT em toda rota,
 * exceto as marcadas com @Public(), e disponibiliza o broker_id do token
 * (nunca do payload da requisição) para os módulos de domínio.
 *
 * Depois de validar a assinatura, confere no banco se a conta ainda pode
 * entrar: e-mail confirmado e status ativo. Isso custa uma leitura por
 * requisição, por chave primária, e é de propósito: guardar essas duas
 * informações dentro do token faria uma suspensão só valer no próximo
 * refresh, ou seja, o corretor suspenso seguiria lendo dado de cliente por
 * até 15 minutos. Se algum dia pesar, o lugar de pôr cache é aqui.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
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

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Sessão expirada ou inválida");
    }

    const broker = await this.prisma.broker.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, emailVerifiedAt: true },
    });
    // Conta apagada com token ainda válido na mão.
    if (!broker) throw new UnauthorizedException("Sessão expirada ou inválida");

    // Suspensa, bloqueada ou desativada: barra igual, sem contar qual.
    if (broker.status !== "ativo") {
      throw new ForbiddenException({
        message: CONTA_SUSPENSA_GUARD,
        details: { code: CODIGO_CONTA_SUSPENSA },
      });
    }

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNVERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowUnverified && broker.emailVerifiedAt === null) {
      throw new ForbiddenException({
        message: EMAIL_NAO_CONFIRMADO,
        details: { code: CODIGO_EMAIL_NAO_CONFIRMADO },
      });
    }

    request.broker = { brokerId: broker.id };
    return true;
  }

  private extractToken(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [type, value] = header.split(" ");
    return type === "Bearer" && value ? value : null;
  }
}
