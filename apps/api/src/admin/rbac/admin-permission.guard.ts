import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AdminPermission } from "@nexlar/shared";
import { REQUIRED_PERMISSION_KEY } from "./require-permission.decorator";
import type { AuthenticatedAdmin } from "./current-admin.decorator";

/**
 * Autorização por permissão. Roda depois do AdminAuthGuard e compara a
 * permissão exigida pela rota com as que o papel da pessoa concede.
 *
 * A mensagem de recusa não diz qual permissão faltou: quem está autenticado
 * no Admin já sabe o que pediu, e o mapa de permissões da plataforma não
 * precisa ser ensinado a quem não o tem.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminPermission | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ admin?: AuthenticatedAdmin }>();
    const admin = request.admin;
    if (!admin || !admin.permissions.includes(required)) {
      throw new ForbiddenException("Você não tem permissão para esta ação.");
    }
    return true;
  }
}
