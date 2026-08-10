import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Broker } from "@prisma/client";
import type {
  AdminBrokerProfile,
  AdminBrokerSummary,
  AdminBrokerUsage,
  AdminListUsersQuery,
  AdminUsersPage,
  SuspendBrokerDto,
} from "@nexlar/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminAuditService } from "../audit/admin-audit.service";
import type { AuthenticatedAdmin } from "../rbac/current-admin.decorator";

/**
 * Gestão de contas de corretor pelo Nexlar Admin (docs/10, Fase 3).
 *
 * O que este serviço NUNCA devolve: dado pessoal de lead ou cliente do
 * corretor. O Admin administra contas, não carteiras; o uso aparece como
 * contagem agregada e nada mais (princípio da finalidade, LGPD).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: AdminListUsersQuery): Promise<AdminUsersPage> {
    const where: Prisma.BrokerWhereInput = {};

    if (query.busca) {
      // Telefone é guardado com máscara variável; comparar só os dígitos
      // faria a busca certa, mas exigiria coluna normalizada. O contains
      // cobre o uso real (a pessoa cola o número como recebeu).
      where.OR = [
        { fullName: { contains: query.busca, mode: "insensitive" } },
        { email: { contains: query.busca, mode: "insensitive" } },
        { phone: { contains: query.busca } },
      ];
    }

    // "pendente_verificacao" é derivado: conta ativa que nunca confirmou o
    // e-mail. Os demais filtros batem direto no status real.
    if (query.status === "pendente_verificacao") {
      where.status = "ativo";
      where.emailVerifiedAt = null;
    } else if (query.status !== "todos") {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.broker.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.pagina - 1) * query.porPagina,
        take: query.porPagina,
      }),
      this.prisma.broker.count({ where }),
    ]);

    return {
      items: items.map((b) => this.toSummary(b)),
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    };
  }

  async profile(id: string): Promise<AdminBrokerProfile> {
    const broker = await this.prisma.broker.findUnique({ where: { id } });
    if (!broker) throw new NotFoundException("Conta não encontrada.");

    const usage = await this.usageOf(id);

    return {
      ...this.toSummary(broker),
      suspendedReason: broker.suspendedReason,
      suspendedAt: broker.suspendedAt?.toISOString() ?? null,
      hasGoogle: broker.googleId !== null,
      hasPassword: broker.passwordHash !== null,
      onboardingCompleto: await this.prisma.onboardingProfile
        .findUnique({ where: { brokerId: id }, select: { brokerId: true } })
        .then(Boolean),
      termsAcceptedAt: broker.termsAcceptedAt?.toISOString() ?? null,
      creci: broker.creci
        ? { numero: broker.creci, uf: broker.creciUf, status: broker.creciStatus }
        : { numero: null, uf: null, status: broker.creciStatus },
      usage,
    };
  }

  /**
   * Suspende a conta do corretor. Os dados ficam intactos; o que morre é a
   * entrada: o guard barra na requisição seguinte e as sessões abertas são
   * revogadas. Mudança e auditoria na mesma transação.
   */
  async suspend(
    actor: AuthenticatedAdmin,
    id: string,
    dto: SuspendBrokerDto,
  ): Promise<AdminBrokerProfile> {
    const broker = await this.prisma.broker.findUnique({ where: { id } });
    if (!broker) throw new NotFoundException("Conta não encontrada.");
    if (broker.status === "suspenso") {
      throw new ForbiddenException("Esta conta já está suspensa.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.broker.update({
        where: { id },
        data: {
          status: "suspenso",
          suspendedAt: new Date(),
          suspendedReason: dto.reason,
        },
      });
      await tx.refreshToken.updateMany({
        where: { brokerId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "logout" },
      });
      await this.audit.record(
        actor,
        {
          action: "corretor_suspenso",
          resourceType: "broker",
          resourceId: id,
          previousState: { status: broker.status },
          newState: { status: "suspenso" },
          reason: dto.reason,
        },
        tx,
      );
    });

    return this.profile(id);
  }

  async reactivate(
    actor: AuthenticatedAdmin,
    id: string,
    dto: SuspendBrokerDto,
  ): Promise<AdminBrokerProfile> {
    const broker = await this.prisma.broker.findUnique({ where: { id } });
    if (!broker) throw new NotFoundException("Conta não encontrada.");
    if (broker.status === "ativo") {
      throw new ForbiddenException("Esta conta já está ativa.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.broker.update({
        where: { id },
        data: { status: "ativo", suspendedAt: null, suspendedReason: null },
      });
      await this.audit.record(
        actor,
        {
          action: "corretor_reativado",
          resourceType: "broker",
          resourceId: id,
          previousState: { status: broker.status },
          newState: { status: "ativo" },
          reason: dto.reason,
        },
        tx,
      );
    });

    return this.profile(id);
  }

  private async usageOf(brokerId: string): Promise<AdminBrokerUsage> {
    const [leads, clientes, imoveis, selecoes, visitas, agendamentos] = await Promise.all([
      this.prisma.lead.count({ where: { brokerId } }),
      this.prisma.conversion.count({ where: { brokerId } }),
      this.prisma.property.count({ where: { brokerId } }),
      this.prisma.propertySelection.count({ where: { brokerId } }),
      this.prisma.visit.count({ where: { brokerId } }),
      this.prisma.agendaEvent.count({ where: { brokerId } }),
    ]);
    return { leads, clientes, imoveis, selecoes, visitas, agendamentos };
  }

  private toSummary(broker: Broker): AdminBrokerSummary {
    return {
      id: broker.id,
      fullName: broker.fullName,
      email: broker.email,
      phone: broker.phone,
      agencyName: broker.agencyName,
      status: broker.status,
      emailVerified: broker.emailVerifiedAt !== null,
      createdAt: broker.createdAt.toISOString(),
      lastLoginAt: broker.lastLoginAt?.toISOString() ?? null,
    };
  }
}
