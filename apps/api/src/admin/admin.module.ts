import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { RateLimitModule } from "../common/rate-limit/rate-limit.module";
import { AdminAuthController } from "./auth/admin-auth.controller";
import { AdminAuthService } from "./auth/admin-auth.service";
import { AdminSessionCookie } from "./auth/admin-session-cookie";
import { AdminOAuthCookies } from "./auth/admin-oauth-cookies";
import { AdminTokenService } from "./auth/admin-token.service";
import { AdminAuditService } from "./audit/admin-audit.service";
import { AdminAuditController } from "./audit/admin-audit.controller";
import { AdminsController } from "./admins/admins.controller";
import { AdminsService } from "./admins/admins.service";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminUsersService } from "./users/admin-users.service";
import { AdminDashboardController } from "./dashboard/admin-dashboard.controller";
import { AdminDashboardService } from "./dashboard/admin-dashboard.service";
import { AdminAuthGuard } from "./rbac/admin-auth.guard";
import { AdminPermissionGuard } from "./rbac/admin-permission.guard";

/**
 * Nextlar Admin (docs/10). Universo separado do corretor: autenticação
 * própria, sessão própria, RBAC próprio e trilha de auditoria própria.
 * Nada aqui importa serviço de domínio do corretor; o LoginAttemptService
 * entra porque é infraestrutura genérica de contagem, não regra de negócio.
 */
@Module({
  // AuthModule entra pelos serviços de INFRAESTRUTURA que exporta (Google
  // OAuth e trava de tentativas): instância única, para o dublê dos testes
  // valer nos dois universos. Nenhum serviço de domínio do corretor é usado.
  imports: [PrismaModule, RateLimitModule, AuthModule],
  controllers: [
    AdminAuthController,
    AdminsController,
    AdminUsersController,
    AdminDashboardController,
    AdminAuditController,
  ],
  providers: [
    AdminAuthService,
    AdminTokenService,
    AdminSessionCookie,
    AdminOAuthCookies,
    AdminAuditService,
    AdminsService,
    AdminUsersService,
    AdminDashboardService,
    AdminAuthGuard,
    AdminPermissionGuard,
  ],
})
export class AdminModule {}
