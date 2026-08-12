import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  adminListUsersQuerySchema,
  suspendBrokerSchema,
  type AdminListUsersQuery,
  type SuspendBrokerDto,
} from "@nexlar/shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminAuthGuard } from "../rbac/admin-auth.guard";
import { AdminPermissionGuard } from "../rbac/admin-permission.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { CurrentAdmin, type AuthenticatedAdmin } from "../rbac/current-admin.decorator";
import { AdminUsersService } from "./admin-users.service";

/**
 * Contas de corretor no Nextlar Admin. Leitura com admin.users.view (admin e
 * suporte enxergam); suspender e reativar exigem admin.users.manage. O
 * @Public() dispensa só o guard global do corretor; quem manda aqui é o par
 * de guards administrativos.
 */
@ApiTags("admin")
@Controller("admin/users")
@Public()
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermission("admin.users.view")
  @ApiOperation({ summary: "Lista contas de corretor, com busca e filtros" })
  list(@Query(new ZodValidationPipe(adminListUsersQuerySchema)) query: AdminListUsersQuery) {
    return this.users.list(query);
  }

  @Get(":id")
  @RequirePermission("admin.users.view")
  @ApiOperation({ summary: "Perfil administrativo de uma conta de corretor" })
  profile(@Param("id", ParseUUIDPipe) id: string) {
    return this.users.profile(id);
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("admin.users.manage")
  @ApiOperation({ summary: "Suspende o acesso de um corretor" })
  suspend(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(suspendBrokerSchema)) dto: SuspendBrokerDto,
  ) {
    return this.users.suspend(actor, id, dto);
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("admin.users.manage")
  @ApiOperation({ summary: "Reativa o acesso de um corretor" })
  reactivate(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(suspendBrokerSchema)) dto: SuspendBrokerDto,
  ) {
    return this.users.reactivate(actor, id, dto);
  }
}
