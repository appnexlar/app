import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AdminPermission, AdminRole } from "@nexlar/shared";

/**
 * O que o AdminAuthGuard pendura na requisição depois de autenticar.
 * As permissões já vêm resolvidas do papel: os handlers nunca olham o papel.
 */
export interface AuthenticatedAdmin {
  adminId: string;
  role: AdminRole;
  permissions: readonly AdminPermission[];
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<{ admin?: AuthenticatedAdmin }>();
    if (!request.admin) {
      // Só acontece se um handler esquecer o guard. Falhar alto aqui é
      // melhor do que uma rota administrativa sem dono aparente.
      throw new Error("CurrentAdmin usado numa rota sem AdminAuthGuard");
    }
    return request.admin;
  },
);
