import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { adminAuditQuerySchema, type AdminAuditQuery } from "@nexlar/shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminAuthGuard } from "../rbac/admin-auth.guard";
import { AdminPermissionGuard } from "../rbac/admin-permission.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Leitura da trilha administrativa. Só quem tem admin.audit.view entra, e a
 * trilha é somente leitura por desenho: não existe rota para editar nem para
 * apagar uma linha. Auditoria que se apaga não é auditoria.
 */
@ApiTags("admin")
@Controller("admin/audit")
@Public()
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RequirePermission("admin.audit.view")
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  @ApiOperation({ summary: "Lista a trilha administrativa, com filtros e paginação" })
  list(@Query(new ZodValidationPipe(adminAuditQuerySchema)) query: AdminAuditQuery) {
    return this.audit.list(query);
  }

  @Get("actors")
  @ApiOperation({ summary: "Administradores que já aparecem na trilha" })
  actors() {
    return this.audit.actors();
  }
}
