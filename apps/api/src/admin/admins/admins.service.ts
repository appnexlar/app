import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import type { AdminUserSummary, CreateAdminDto, UpdateAdminDto } from "@nexlar/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminAuditService } from "../audit/admin-audit.service";
import { AdminTokenService } from "../auth/admin-token.service";
import type { AuthenticatedAdmin } from "../rbac/current-admin.decorator";

/**
 * Gestão do próprio time administrativo (Task 3 da épica: só o super_admin
 * chega aqui, via permissão admin.admins.manage).
 *
 * Duas autoproteções que não são burocracia:
 * - ninguém altera a própria conta por aqui: suspender a si mesmo é se
 *   trancar para fora, e subir o próprio papel é escalada de privilégio;
 * - o último super_admin ativo é intocável: sem ele, ninguém mais gerencia
 *   administradores, e a saída passaria a ser mexer no banco na mão.
 */
@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly tokens: AdminTokenService,
  ) {}

  async list(): Promise<AdminUserSummary[]> {
    const admins = await this.prisma.adminUser.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return admins.map((a) => ({
      ...a,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async create(actor: AuthenticatedAdmin, dto: CreateAdminDto): Promise<AdminUserSummary> {
    const existente = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException("Já existe um administrador com este e-mail.");

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const criado = await this.prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.create({
        data: { email: dto.email, fullName: dto.fullName, role: dto.role, passwordHash },
      });
      await this.audit.record(
        actor,
        {
          action: "admin_criado",
          resourceType: "admin_user",
          resourceId: admin.id,
          // Nunca o hash: auditoria guarda o que mudou, não credencial.
          newState: { email: admin.email, fullName: admin.fullName, role: admin.role },
        },
        tx,
      );
      return admin;
    });

    return {
      id: criado.id,
      email: criado.email,
      fullName: criado.fullName,
      role: criado.role,
      status: criado.status,
      lastLoginAt: null,
      createdAt: criado.createdAt.toISOString(),
    };
  }

  async update(
    actor: AuthenticatedAdmin,
    id: string,
    dto: UpdateAdminDto,
  ): Promise<AdminUserSummary> {
    if (id === actor.adminId) {
      throw new ForbiddenException("Você não pode alterar a própria conta por aqui.");
    }

    const alvo = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!alvo) throw new NotFoundException("Administrador não encontrado.");

    // Proteção do último super_admin ativo: rebaixar ou suspender só se
    // sobrar pelo menos um outro em pé depois da mudança.
    const perdeSuper =
      alvo.role === "super_admin" &&
      ((dto.role && dto.role !== "super_admin") || dto.status === "suspenso");
    if (perdeSuper) {
      const outros = await this.prisma.adminUser.count({
        where: { role: "super_admin", status: "ativo", id: { not: alvo.id } },
      });
      if (outros === 0) {
        throw new ForbiddenException(
          "Este é o último super admin ativo. Promova outra pessoa antes.",
        );
      }
    }

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.update({
        where: { id },
        data: { role: dto.role, status: dto.status },
      });
      await this.audit.record(
        actor,
        {
          action: dto.status === "suspenso" ? "admin_suspenso" : "admin_alterado",
          resourceType: "admin_user",
          resourceId: admin.id,
          previousState: { role: alvo.role, status: alvo.status },
          newState: { role: admin.role, status: admin.status },
          reason: dto.reason,
        },
        tx,
      );
      return admin;
    });

    // Suspensão derruba as sessões abertas fora da transação: se falhar,
    // o guard já barra a próxima requisição de qualquer jeito.
    if (dto.status === "suspenso") {
      await this.tokens.revokeAllSessions(id);
    }

    return {
      id: atualizado.id,
      email: atualizado.email,
      fullName: atualizado.fullName,
      role: atualizado.role,
      status: atualizado.status,
      lastLoginAt: atualizado.lastLoginAt?.toISOString() ?? null,
      createdAt: atualizado.createdAt.toISOString(),
    };
  }
}
