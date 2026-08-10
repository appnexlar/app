import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { FastifyRequest } from "fastify";
import { permissionsForRole } from "@nexlar/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedAdmin } from "./current-admin.decorator";

/** Marca que separa um access token administrativo de qualquer outro JWT. */
export const TIPO_TOKEN_ADMIN = "admin";

interface AdminAccessPayload {
  sub: string;
  typ?: string;
}

/**
 * Autenticação do Nexlar Admin. Não é o JwtAuthGuard com outro nome, e a
 * diferença é o ponto: segredo próprio (JWT_ADMIN_SECRET) e claim de tipo
 * própria, então um token de corretor não passa aqui nem por bug, e um token
 * administrativo não passa no guard do corretor (docs/10, R1).
 *
 * Sem o segredo configurado, o Admin inteiro responde 404: é o mesmo
 * desligamento proposital do "entrar com o Google". Porta que não existe é
 * melhor que porta quebrada.
 *
 * Como no guard do corretor, o banco é consultado a cada requisição: uma
 * suspensão de administrador vale na requisição seguinte, não no próximo
 * refresh. Em sessão privilegiada esse imediatismo importa ainda mais.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>("JWT_ADMIN_SECRET", "");
    if (!secret) throw new NotFoundException();

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { admin?: AuthenticatedAdmin }>();

    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException("Autenticação necessária");

    let payload: AdminAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminAccessPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException("Sessão expirada ou inválida");
    }
    if (payload.typ !== TIPO_TOKEN_ADMIN) {
      throw new UnauthorizedException("Sessão expirada ou inválida");
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });
    if (!admin) throw new UnauthorizedException("Sessão expirada ou inválida");
    if (admin.status === "suspenso") {
      throw new ForbiddenException("Este acesso administrativo está suspenso.");
    }

    request.admin = {
      adminId: admin.id,
      role: admin.role,
      permissions: permissionsForRole(admin.role),
    };
    return true;
  }

  private extractToken(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [type, value] = header.split(" ");
    return type === "Bearer" && value ? value : null;
  }
}
