import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createAdminSchema,
  updateAdminSchema,
  type CreateAdminDto,
  type UpdateAdminDto,
} from "@nexlar/shared";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AdminAuthGuard } from "../rbac/admin-auth.guard";
import { AdminPermissionGuard } from "../rbac/admin-permission.guard";
import { RequirePermission } from "../rbac/require-permission.decorator";
import { CurrentAdmin, type AuthenticatedAdmin } from "../rbac/current-admin.decorator";
import { AdminsService } from "./admins.service";

/**
 * Gestão do time administrativo. O @Public() dispensa só o guard global do
 * corretor; a classe inteira está atrás do par AdminAuthGuard +
 * AdminPermissionGuard, e cada rota declara a permissão que exige.
 */
@ApiTags("admin")
@Controller("admin/admins")
@Public()
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @RequirePermission("admin.admins.view")
  @ApiOperation({ summary: "Lista os administradores da plataforma" })
  list() {
    return this.admins.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("admin.admins.manage")
  @ApiOperation({ summary: "Cria um administrador" })
  create(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Body(new ZodValidationPipe(createAdminSchema)) dto: CreateAdminDto,
  ) {
    return this.admins.create(actor, dto);
  }

  @Patch(":id")
  @RequirePermission("admin.admins.manage")
  @ApiOperation({ summary: "Altera papel ou status de um administrador" })
  update(
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdminSchema)) dto: UpdateAdminDto,
  ) {
    return this.admins.update(actor, id, dto);
  }
}
