import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ChangeLeadStatusDto,
  ConvertLeadDto,
  CreateLeadDto,
  LeadDetail,
  LeadSummary,
} from "@nexlar/shared";
import { CONSENT_VERSION } from "@nexlar/shared";
import { STATUS_LABELS } from "./status-labels";
import { Prisma, type Lead, type LeadActivity } from "@prisma/client";
import type { ClientPurpose, ConversionNextStep, ConversionReason } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "../guidance/product-event.service";

/** Uma lead "tem preferências" quando traz ao menos um critério de busca. */
function temPreferencias(dados: {
  intent?: unknown;
  audience?: unknown;
  region?: unknown;
  budgetMin?: unknown;
  budgetMax?: unknown;
}): boolean {
  return Boolean(
    dados.intent ||
      dados.audience ||
      dados.region ||
      dados.budgetMin != null ||
      dados.budgetMax != null,
  );
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
  ) {}

  /**
   * Cadastro rápido (J1). Duplicado = mesmo WhatsApp do mesmo corretor:
   * devolve 409 com o lead existente para o front oferecer "abrir ficha".
   */
  async create(brokerId: string, dto: CreateLeadDto): Promise<LeadSummary> {
    const existing = await this.prisma.lead.findFirst({
      where: { brokerId, whatsapp: dto.whatsapp },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      throw new ConflictException({
        message: "Você já tem um lead com esse WhatsApp.",
        details: { existingLead: this.toSummary(existing) },
      });
    }

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          brokerId,
          fullName: dto.fullName,
          whatsapp: dto.whatsapp,
          email: dto.email,
          source: dto.source,
          intent: dto.intent,
          audience: dto.audience,
          region: dto.region,
          budgetMin: dto.budgetMin != null ? new Prisma.Decimal(dto.budgetMin) : undefined,
          budgetMax: dto.budgetMax != null ? new Prisma.Decimal(dto.budgetMax) : undefined,
          notes: dto.notes,
        },
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: created.id,
          type: "nota",
          description: "Lead cadastrado",
          metadata: dto.source ? { source: dto.source } : undefined,
        },
      });
      // Marcos da Jornada 2, dentro da mesma transação: ou nascem com a lead,
      // ou nenhum nasce. Idempotentes, então a segunda lead não regrava.
      await this.events.track(
        brokerId,
        { type: "FIRST_LEAD_CREATED", source: "ui", entityType: "lead", entityId: created.id },
        tx,
      );
      if (temPreferencias(dto)) {
        await this.events.track(
          brokerId,
          { type: "LEAD_PREFERENCES_ADDED", source: "ui", entityType: "lead", entityId: created.id },
          tx,
        );
      }
      return created;
    });

    return this.toSummary(lead);
  }

  /**
   * Lista só quem ainda é lead. Quem converteu vive na área Clientes: a pessoa
   * é a mesma no banco (2.16), mas a experiência separa as duas fases.
   */
  async list(brokerId: string, opts: { apenasAbertos?: boolean } = {}): Promise<LeadSummary[]> {
    // Entidade única (set 2026): a lista é de todo mundo. O recorte
    // "apenasAbertos" existe para a rota antiga /leads continuar devolvendo
    // o que sempre devolveu enquanto o front não muda.
    const leads = await this.prisma.lead.findMany({
      where: { brokerId, ...(opts.apenasAbertos ? { isClient: false } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return leads.map((lead) => this.toSummary(lead));
  }

  async findOne(brokerId: string, id: string): Promise<LeadDetail> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, brokerId },
      include: { activities: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    return this.toDetail(lead);
  }

  /**
   * Muda a etapa da lead no funil e registra na timeline. Regras de negócio
   * (docs/02 §2.9, LEAD-08, LEAD-13) moram aqui, nunca no front:
   * - "fechado" é recusada: só a ação explícita de conversão
   *   chega lá (mudar etapa nunca converte).
   * - "perdida" exige motivo (lostReason).
   * - "reativar_futuro" exige data futura e cria a tarefa de reativação.
   */
  async changeStatus(
    brokerId: string,
    id: string,
    dto: ChangeLeadStatusDto,
  ): Promise<LeadSummary> {
    const lead = await this.prisma.lead.findFirst({ where: { id, brokerId } });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    if (lead.status === dto.status) return this.toSummary(lead);

    // Entidade única (set 2026): "fechado" é uma etapa como as outras. Chegar
    // nela grava o registro do fechamento, que continua sendo a fonte de
    // "fechado em" e das métricas de tempo até fechar.
    if (dto.status === "fechado") {
      if (dto.propertyId) {
        const property = await this.prisma.property.findFirst({
          where: { id: dto.propertyId, brokerId },
        });
        if (!property) throw new NotFoundException("Imóvel não encontrado.");
      }
      const fechado = await this.prisma.$transaction((tx) =>
        this.fecharNegocio(tx, brokerId, lead, {
          reason: "negociacao_formal",
          reasonDetail: dto.closeNote ?? null,
          nextStep: "coletar_dados",
          purpose: dto.purpose ?? "compra",
          propertyId: dto.propertyId ?? null,
          consentGiven: false,
        }),
      );
      return this.toSummary(fechado);
    }
    if (dto.status === "perdida" && !dto.lostReason) {
      throw new BadRequestException("Informe o motivo da perda.");
    }

    let reactivateAt: Date | null = null;
    if (dto.status === "reativar_futuro") {
      if (!dto.reactivateAt) {
        throw new BadRequestException("Informe a data para reativar o contato.");
      }
      reactivateAt = new Date(`${dto.reactivateAt}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (reactivateAt.getTime() <= today.getTime()) {
        throw new BadRequestException("A data de reativação precisa ser futura.");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.lead.update({
        where: { id },
        data: {
          status: dto.status,
          lastContactAt: new Date(),
          lostReason: dto.status === "perdida" ? dto.lostReason : null,
          reactivateAt: dto.status === "reativar_futuro" ? reactivateAt : null,
        },
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: id,
          type: "mudanca_status",
          description:
            dto.status === "perdida"
              ? `Lead marcada como perdida: ${dto.lostReason}`
              : `Etapa alterada de ${STATUS_LABELS[lead.status]} para ${STATUS_LABELS[dto.status]}`,
          metadata: { from: lead.status, to: dto.status },
        },
      });
      if (dto.status === "reativar_futuro" && reactivateAt) {
        await tx.agendaEvent.create({
          data: {
            brokerId,
            leadId: id,
            type: "tarefa",
            title: `Reativar contato com ${lead.fullName}`,
            startAt: reactivateAt,
            allDay: true,
            status: "pendente",
            taskKind: "retorno",
          },
        });
        await tx.lead.update({ where: { id }, data: { nextActionAt: reactivateAt } });
        await tx.leadActivity.create({
          data: {
            brokerId,
            leadId: id,
            type: "tarefa_criada",
            description: `Tarefa de reativação criada para ${dto.reactivateAt}`,
            metadata: { reactivateAt: dto.reactivateAt },
          },
        });
      }
      return next;
    });

    return this.toSummary(updated);
  }

  /**
   * Conversão consciente de lead em cliente (docs/02 §2.16, LEAD-13). É a MESMA
   * pessoa: não duplica o cadastro, preserva toda a jornada (timeline, imóveis
   * enviados, visitas, tarefas). Só esta rota converte; mudar status nunca.
   * Tudo em uma transação: sem conversão parcial. Registra consentimento LGPD e
   * trilha de auditoria (sem dados sensíveis).
   */
  async convert(brokerId: string, id: string, dto: ConvertLeadDto): Promise<LeadSummary> {
    const lead = await this.prisma.lead.findFirst({ where: { id, brokerId } });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    if (lead.isClient) {
      throw new ConflictException("Esta pessoa já é cliente.");
    }
    if (dto.reason === "outro" && !dto.reasonDetail) {
      throw new BadRequestException("Descreva o motivo da conversão.");
    }
    if (dto.propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: dto.propertyId, brokerId },
      });
      if (!property) throw new NotFoundException("Imóvel não encontrado.");
    }

    const updated = await this.prisma.$transaction((tx) =>
      this.fecharNegocio(tx, brokerId, lead, {
        reason: dto.reason,
        reasonDetail: dto.reason === "outro" ? (dto.reasonDetail ?? null) : null,
        nextStep: dto.nextStep,
        purpose: dto.purpose,
        propertyId: dto.propertyId ?? null,
        consentGiven: dto.consent,
      }),
    );
    return this.toSummary(updated);
  }

  /**
   * O fechamento do negócio, numa transação só: marca a pessoa, grava o
   * registro do fechamento, a ciência da coleta (quando dada), a timeline, a
   * auditoria e o marco do checklist. É o mesmo caminho para quem fecha pelo
   * funil e para quem usa a rota antiga de conversão.
   */
  private async fecharNegocio(
    tx: Prisma.TransactionClient,
    brokerId: string,
    lead: Lead,
    dados: {
      reason: ConversionReason;
      reasonDetail: string | null;
      nextStep: ConversionNextStep;
      purpose: ClientPurpose;
      propertyId: string | null;
      consentGiven: boolean;
    },
  ): Promise<Lead> {
    const agora = new Date();
    const next = await tx.lead.update({
      where: { id: lead.id },
      data: { isClient: true, convertedAt: agora, status: "fechado", lastContactAt: agora },
    });
    await tx.conversion.create({
      data: {
        brokerId,
        leadId: lead.id,
        reason: dados.reason,
        reasonDetail: dados.reasonDetail,
        nextStep: dados.nextStep,
        purpose: dados.purpose,
        propertyId: dados.propertyId,
        consentGiven: dados.consentGiven,
      },
    });
    if (dados.consentGiven) {
      await tx.consent.create({
        data: {
          brokerId,
          leadId: lead.id,
          purpose: "coleta_dados_adicionais",
          textVersion: CONSENT_VERSION,
        },
      });
    }
    await tx.leadActivity.create({
      data: {
        brokerId,
        leadId: lead.id,
        type: "conversao",
        description: "Negócio fechado",
        metadata: { from: lead.status, reason: dados.reason, purpose: dados.purpose },
      },
    });
    await tx.auditLog.create({
      data: {
        brokerId,
        action: "lead_convertida",
        entityType: "lead",
        entityId: lead.id,
        metadata: { reason: dados.reason, nextStep: dados.nextStep },
      },
    });
    await this.events.track(
      brokerId,
      {
        type: "FIRST_LEAD_CONVERTED",
        entityType: "lead",
        entityId: lead.id,
        metadata: { reason: dados.reason },
      },
      tx,
    );
    return next;
  }

  /** Exclusão definitiva do lead (cascata apaga timeline, tarefas, visitas). */
  async remove(brokerId: string, id: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({ where: { id, brokerId } });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    await this.prisma.lead.delete({ where: { id } });
  }

  private toSummary(lead: Lead): LeadSummary {
    return {
      id: lead.id,
      code: lead.code,
      fullName: lead.fullName,
      whatsapp: lead.whatsapp,
      status: lead.status,
      isClient: lead.isClient,
      convertedAt: lead.convertedAt?.toISOString() ?? null,
      source: lead.source,
      intent: lead.intent,
      region: lead.region,
      budgetMin: lead.budgetMin != null ? Number(lead.budgetMin) : null,
      budgetMax: lead.budgetMax != null ? Number(lead.budgetMax) : null,
      nextActionAt: lead.nextActionAt?.toISOString() ?? null,
      lastContactAt: lead.lastContactAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
    };
  }

  private toDetail(lead: Lead & { activities: LeadActivity[] }): LeadDetail {
    return {
      ...this.toSummary(lead),
      email: lead.email,
      audience: lead.audience,
      budgetMin: lead.budgetMin != null ? Number(lead.budgetMin) : null,
      budgetMax: lead.budgetMax != null ? Number(lead.budgetMax) : null,
      notes: lead.notes,
      lastContactAt: lead.lastContactAt?.toISOString() ?? null,
      updatedAt: lead.updatedAt.toISOString(),
      activities: lead.activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
