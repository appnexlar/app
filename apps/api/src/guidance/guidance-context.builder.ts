import { Injectable } from "@nestjs/common";
import type { ProductEventType } from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { GuidanceContext } from "./guidance-context";

/** Status de lead que contam como "em negociação" para as regras operacionais. */
const STATUS_NEGOCIACAO = [
  "imovel_prioritario",
  "aguardando_decisao",
] as const;

/** Status que a lead nunca deixa sozinha: não faz sentido cobrar follow-up. */
const STATUS_ENCERRADOS = [
  "fechado",
  "perdida",
  "reativar_futuro",
] as const;

/**
 * Monta o retrato do contexto (GuidanceContext) a partir do banco, sempre
 * isolado por broker_id. Toda consulta é de contagem ou de existência: nada de
 * dado sensível sai daqui, só números que o motor usa para decidir.
 *
 * Fica separado do motor de propósito: a regra (engine) é pura e testável com
 * um contexto de mentira; a leitura do banco (builder) é o que muda quando o
 * modelo evolui.
 */
@Injectable()
export class GuidanceContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(brokerId: string, now: Date = new Date()): Promise<GuidanceContext> {
    const [
      broker,
      leadCount,
      leadsSemPreferencias,
      propertyCount,
      matchCount,
      linkCount,
      leadsSemFollowUp,
      negociacoesSemProximaAcao,
      visitAvailabilityCount,
      eventos,
    ] = await this.prisma.$transaction([
      this.prisma.broker.findUnique({
        where: { id: brokerId },
        select: { phone: true, creci: true, agencyName: true, avatarUrl: true },
      }),
      this.prisma.lead.count({ where: { brokerId } }),
      this.prisma.lead.count({
        where: {
          brokerId,
          intent: null,
          audience: null,
          region: null,
          budgetMin: null,
          budgetMax: null,
        },
      }),
      this.prisma.property.count({ where: { brokerId } }),
      this.prisma.selectionItem.count({ where: { brokerId } }),
      this.prisma.propertySelection.count({ where: { brokerId } }),
      this.prisma.lead.count({
        where: {
          brokerId,
          isClient: false,
          status: { notIn: [...STATUS_ENCERRADOS] },
          nextActionAt: { lt: now },
        },
      }),
      this.prisma.lead.count({
        where: {
          brokerId,
          status: { in: [...STATUS_NEGOCIACAO] },
          nextActionAt: null,
        },
      }),
      this.prisma.visitAvailability.count({ where: { brokerId } }),
      this.prisma.productEvent.findMany({
        where: { brokerId, dedupeKey: { not: null } },
        select: { type: true },
      }),
    ]);

    const milestones = new Set<ProductEventType>(
      eventos.map((e) => e.type as ProductEventType),
    );

    return {
      brokerId,
      now,
      profileComplete: this.perfilCompleto(broker),
      leadCount,
      leadsSemPreferencias,
      propertyCount,
      matchCount,
      linkCount,
      calendarConfigured: visitAvailabilityCount > 0,
      leadsSemFollowUp,
      negociacoesSemProximaAcao,
      milestones,
    };
  }

  /**
   * Perfil "completo" o bastante para deixar de cobrar: telefone preenchido e
   * ao menos um sinal profissional (CRECI ou nome da imobiliária). Critério
   * deliberadamente leve, para não virar burocracia.
   */
  private perfilCompleto(
    broker: { phone: string | null; creci: string | null; agencyName: string | null } | null,
  ): boolean {
    if (!broker) return false;
    return Boolean(broker.phone) && Boolean(broker.creci || broker.agencyName);
  }
}
