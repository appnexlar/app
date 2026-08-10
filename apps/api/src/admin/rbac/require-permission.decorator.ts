import { SetMetadata } from "@nestjs/common";
import type { AdminPermission } from "@nexlar/shared";

export const REQUIRED_PERMISSION_KEY = "admin_required_permission";

/**
 * Declara a permissão que a rota exige. O tipo vem do catálogo do shared,
 * então permissão inventada nem compila.
 *
 * Rota sem esta anotação exige só autenticação (caso do /me). Toda rota que
 * lê ou muda dados de outra pessoa deve declarar a sua.
 */
export const RequirePermission = (permission: AdminPermission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
