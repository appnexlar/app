import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { adminDashboardQuerySchema, type AdminDashboardQuery } from "@nexlar/shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminAuthGuard } from "../rbac/admin-auth.guard";
import { AdminPermissionGuard } from "../rbac/admin-permission.guard";
import { CurrentAdmin, type AuthenticatedAdmin } from "../rbac/current-admin.decorator";
import { AdminDashboardService } from "./admin-dashboard.service";

/**
 * Dashboard administrativo. Sem @RequirePermission de propósito: é a tela
 * inicial do painel, e todo admin autenticado chega nela. O recorte acontece
 * dentro do serviço, bloco a bloco, conforme o que o papel alcança; um 403 na
 * porta de entrada não protegeria mais nada e deixaria a pessoa sem lugar.
 *
 * O @Public() dispensa só o guard global do corretor; quem manda aqui é o par
 * de guards administrativos.
 */
@ApiTags("admin")
@Controller("admin/dashboard")
@Public()
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get("summary")
  @ApiOperation({ summary: "Indicadores da plataforma, alertas e cadastros recentes" })
  summary(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Query(new ZodValidationPipe(adminDashboardQuerySchema)) query: AdminDashboardQuery,
  ) {
    return this.dashboard.summary(actor, query);
  }
}
