import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
}
