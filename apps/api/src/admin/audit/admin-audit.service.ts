import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AdminAuditActorOption,
  AdminAuditEntry,
  AdminAuditPage,
  AdminAuditQuery,
} from "@nexlar/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedAdmin } from "../rbac/current-admin.decorator";

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  /** Estado antes e depois, só os campos que mudaram. Nunca senha ou token. */
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  reason?: string;
}

/**
 * Grava a trilha administrativa: quem fez, o quê, em qual recurso, quando,
 * de qual estado para qual estado.
 *
 * O `tx` opcional existe para a regra de ouro da Task 27: a mudança e a sua
 * linha de auditoria acontecem NA MESMA transação. Ou as duas entram, ou
 * nenhuma. Ação auditada "depois, se der" é ação sem auditoria.
 */
@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actor: AuthenticatedAdmin,
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.adminAuditLog.create({
      data: {
        actorAdminId: actor.adminId,
        actorRole: actor.role,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        previousState: entry.previousState,
        newState: entry.newState,
        reason: entry.reason,
      },
    });
  }

  /**
   * Lê a trilha, da mais recente para a mais antiga (Fase 5).
   *
   * O nome do alvo é resolvido DEPOIS da consulta principal, em lote, por
   * dois motivos: a tabela não tem chave estrangeira para o alvo (é o que a
   * faz sobreviver à exclusão), e um join por linha traria o problema de
   * N+1 numa tela que existe para ser paginada.
   */
  async list(query: AdminAuditQuery): Promise<AdminAuditPage> {
    const where: Prisma.AdminAuditLogWhereInput = {};
    if (query.ator) where.actorAdminId = query.ator;
    if (query.acao) where.action = query.acao;
    if (query.recurso) where.resourceType = query.recurso;
    if (query.recursoId) where.resourceId = query.recursoId;
    if (query.de || query.ate) {
      where.createdAt = {
        ...(query.de ? { gte: new Date(query.de) } : {}),
        ...(query.ate ? { lte: new Date(query.ate) } : {}),
      };
    }

    const [linhas, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.pagina - 1) * query.porPagina,
        take: query.porPagina,
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    const nomes = await this.nomesDosAlvos(linhas);

    return {
      items: linhas.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        action: l.action,
        actor: {
          id: l.actor.id,
          fullName: l.actor.fullName,
          email: l.actor.email,
          // O papel vem da linha, não da conta: é o papel de quando aconteceu.
          role: l.actorRole,
        },
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        resourceLabel: l.resourceId ? (nomes.get(chave(l.resourceType, l.resourceId)) ?? null) : null,
        previousState: l.previousState as Record<string, unknown> | null,
        newState: l.newState as Record<string, unknown> | null,
        reason: l.reason,
      })),
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    };
  }

  /** Quem já apareceu na trilha, para o filtro de ator não listar quem nunca agiu. */
  async actors(): Promise<AdminAuditActorOption[]> {
    const grupos = await this.prisma.adminAuditLog.groupBy({ by: ["actorAdminId"] });
    if (grupos.length === 0) return [];

    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: grupos.map((g) => g.actorAdminId) } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
    return admins;
  }

  /**
   * Nome de cada alvo citado nas linhas, numa consulta por tipo. Alvo que não
   * existe mais simplesmente não entra no mapa, e a tela mostra que a conta
   * foi excluída: a trilha continua de pé sem ele, que é o ponto dela.
   */
  private async nomesDosAlvos(
    linhas: { resourceType: string; resourceId: string | null }[],
  ): Promise<Map<string, string>> {
    const porTipo = new Map<string, Set<string>>();
    for (const l of linhas) {
      if (!l.resourceId) continue;
      const atual = porTipo.get(l.resourceType) ?? new Set<string>();
      atual.add(l.resourceId);
      porTipo.set(l.resourceType, atual);
    }

    const mapa = new Map<string, string>();
    const brokers = porTipo.get("broker");
    const admins = porTipo.get("admin_user");

    const [achadosBroker, achadosAdmin] = await Promise.all([
      brokers?.size
        ? this.prisma.broker.findMany({
            where: { id: { in: [...brokers] } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
      admins?.size
        ? this.prisma.adminUser.findMany({
            where: { id: { in: [...admins] } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
    ]);

    for (const b of achadosBroker) mapa.set(chave("broker", b.id), b.fullName);
    for (const a of achadosAdmin) mapa.set(chave("admin_user", a.id), a.fullName);
    return mapa;
  }
}

function chave(tipo: string, id: string): string {
  return `${tipo}:${id}`;
}
