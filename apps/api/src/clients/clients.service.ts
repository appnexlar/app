import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ClientDetail,
  ClientFinancialData,
  ClientNegotiationData,
  ClientProfileData,
  ClientSummary,
  DeletionRequestSummary,
  ListClientsQuery,
  ParticipantSummary,
  RequestDeletionDto,
  UpdateClientFinancialDto,
  UpdateClientNegotiationDto,
  UpdateClientProfileDto,
  UpsertParticipantDto,
} from "@nexlar/shared";
import {
  Prisma,
  type ClientFinancial,
  type ClientNegotiation,
  type ClientParticipant,
  type ClientProfile,
  type DataDeletionRequest,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const CLIENT_INCLUDE = {
  conversion: { include: { property: { select: { title: true } } } },
} as const;

type LeadWithConversion = Prisma.LeadGetPayload<{ include: typeof CLIENT_INCLUDE }>;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista apenas pessoas convertidas (is_client) do corretor autenticado.
   * Só campos seguros: nunca CPF completo, renda ou documentos (LGPD).
   */
  async list(brokerId: string, query: ListClientsQuery): Promise<ClientSummary[]> {
    const where: Prisma.LeadWhereInput = { brokerId, isClient: true };

    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: "insensitive" } },
        { whatsapp: { contains: query.q } },
        { email: { contains: query.q, mode: "insensitive" } },
        { cpf: { contains: query.q } },
      ];
    }
    if (query.purpose) where.conversion = { purpose: query.purpose };
    if (query.hasRelatedProperty === true) {
      where.conversion = { ...(where.conversion as object), propertyId: { not: null } };
    }
    if (query.hasRelatedProperty === false) {
      where.conversion = { ...(where.conversion as object), propertyId: null };
    }

    const clients = await this.prisma.lead.findMany({
      where,
      include: CLIENT_INCLUDE,
      orderBy: { convertedAt: "desc" },
    });
    return clients.map((c) => this.toSummary(c));
  }

  /** Ficha do cliente: reaproveita a jornada da lead + dados da conversão. */
  async findOne(brokerId: string, id: string): Promise<ClientDetail> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, brokerId, isClient: true },
      include: {
        conversion: { include: { property: { select: { title: true } } } },
        consents: { orderBy: { acceptedAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
        clientProfile: true,
        clientNegotiation: true,
        clientFinancial: true,
        participants: { orderBy: { createdAt: "asc" } },
        deletionRequests: { orderBy: { requestedAt: "desc" }, take: 1 },
      },
    });
    if (!lead) throw new NotFoundException("Cliente não encontrado.");

    return {
      id: lead.id,
      fullName: lead.fullName,
      whatsapp: lead.whatsapp,
      status: lead.status,
      isClient: lead.isClient,
      source: lead.source,
      intent: lead.intent,
      region: lead.region,
      budgetMin: lead.budgetMin != null ? Number(lead.budgetMin) : null,
      budgetMax: lead.budgetMax != null ? Number(lead.budgetMax) : null,
      nextActionAt: lead.nextActionAt?.toISOString() ?? null,
      lastContactAt: lead.lastContactAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      email: lead.email,
      audience: lead.audience,
      notes: lead.notes,
      updatedAt: lead.updatedAt.toISOString(),
      activities: lead.activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
      })),
      convertedAt: lead.convertedAt?.toISOString() ?? null,
      conversion: lead.conversion
        ? {
            convertedAt: lead.conversion.convertedAt.toISOString(),
            reason: lead.conversion.reason,
            reasonDetail: lead.conversion.reasonDetail,
            nextStep: lead.conversion.nextStep,
            purpose: lead.conversion.purpose,
            propertyId: lead.conversion.propertyId,
            propertyTitle: lead.conversion.property?.title ?? null,
          }
        : null,
      consents: lead.consents.map((c) => ({
        id: c.id,
        purpose: c.purpose,
        textVersion: c.textVersion,
        acceptedAt: c.acceptedAt.toISOString(),
      })),
      profile: lead.clientProfile ? this.toProfileData(lead.clientProfile) : null,
      negotiation: lead.clientNegotiation
        ? this.toNegotiationData(lead.clientNegotiation)
        : null,
      financial: lead.clientFinancial ? this.toFinancialData(lead.clientFinancial) : null,
      participants: lead.participants.map((p) => this.toParticipant(p)),
      deletionRequest: lead.deletionRequests[0]
        ? this.toDeletionRequest(lead.deletionRequests[0])
        : null,
    };
  }

  /** Dados financeiros (sensíveis). Auditoria só com nomes de campos. */
  async updateFinancial(
    brokerId: string,
    id: string,
    dto: UpdateClientFinancialDto,
  ): Promise<ClientFinancialData> {
    await this.assertClient(brokerId, id);
    const data = {
      incomeType: dto.incomeType,
      monthlyIncome: dto.monthlyIncome != null ? new Prisma.Decimal(dto.monthlyIncome) : null,
      occupation: dto.occupation,
      activityTime: dto.activityTime,
      downPayment: dto.downPayment != null ? new Prisma.Decimal(dto.downPayment) : null,
      hasFgts: dto.hasFgts ?? null,
      preferredBank: dto.preferredBank,
      hasIncomeComposition: dto.hasIncomeComposition ?? null,
      dependentsCount: dto.dependentsCount ?? null,
      notes: dto.notes,
    };
    const financial = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.clientFinancial.upsert({
        where: { leadId: id },
        create: { brokerId, leadId: id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "dados_financeiros_alterados",
          entityType: "client_financial",
          entityId: id,
          metadata: { fields: Object.keys(data).filter((k) => data[k as keyof typeof data] != null) },
        },
      });
      return saved;
    });
    return this.toFinancialData(financial);
  }

  async addParticipant(
    brokerId: string,
    id: string,
    dto: UpsertParticipantDto,
  ): Promise<ParticipantSummary> {
    await this.assertClient(brokerId, id);
    const created = await this.prisma.$transaction(async (tx) => {
      const p = await tx.clientParticipant.create({
        data: {
          brokerId,
          leadId: id,
          relation: dto.relation,
          fullName: dto.fullName,
          cpf: dto.cpf ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          notes: dto.notes ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "participante_adicionado",
          entityType: "client_participant",
          entityId: id,
          metadata: { relation: dto.relation },
        },
      });
      return p;
    });
    return this.toParticipant(created);
  }

  async updateParticipant(
    brokerId: string,
    id: string,
    participantId: string,
    dto: UpsertParticipantDto,
  ): Promise<ParticipantSummary> {
    await this.assertClient(brokerId, id);
    const existing = await this.prisma.clientParticipant.findFirst({
      where: { id: participantId, leadId: id, brokerId },
    });
    if (!existing) throw new NotFoundException("Participante não encontrado.");
    const updated = await this.prisma.clientParticipant.update({
      where: { id: participantId },
      data: {
        relation: dto.relation,
        fullName: dto.fullName,
        cpf: dto.cpf ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
      },
    });
    return this.toParticipant(updated);
  }

  async removeParticipant(brokerId: string, id: string, participantId: string): Promise<void> {
    await this.assertClient(brokerId, id);
    const existing = await this.prisma.clientParticipant.findFirst({
      where: { id: participantId, leadId: id, brokerId },
    });
    if (!existing) throw new NotFoundException("Participante não encontrado.");
    await this.prisma.clientParticipant.delete({ where: { id: participantId } });
  }

  /**
   * Solicitação de exclusão de dados (LGPD). Não apaga: registra a solicitação
   * para análise de retenção. A exclusão/anonimização efetiva vem depois.
   */
  async requestDeletion(
    brokerId: string,
    id: string,
    dto: RequestDeletionDto,
  ): Promise<DeletionRequestSummary> {
    await this.assertClient(brokerId, id);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dataDeletionRequest.create({
        data: { brokerId, leadId: id, reason: dto.reason ?? null },
      });
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "exclusao_solicitada",
          entityType: "lead",
          entityId: id,
        },
      });
      return created;
    });
    return this.toDeletionRequest(request);
  }

  /**
   * Atualiza (ou cria) os dados pessoais do cliente. Coleta progressiva: tudo
   * opcional. Audita QUAIS campos mudaram, nunca os valores (LGPD).
   */
  async updateProfile(
    brokerId: string,
    id: string,
    dto: UpdateClientProfileDto,
  ): Promise<ClientProfileData> {
    await this.assertClient(brokerId, id);
    const data = {
      cpf: dto.cpf,
      rg: dto.rg,
      birthDate: dto.birthDate ? new Date(`${dto.birthDate}T00:00:00Z`) : null,
      maritalStatus: dto.maritalStatus,
      nationality: dto.nationality,
      residenceCountry: dto.residenceCountry,
      cep: dto.cep,
      street: dto.street,
      addressNumber: dto.addressNumber,
      complement: dto.complement,
      neighborhood: dto.neighborhood,
      city: dto.city,
      state: dto.state,
      altPhone: dto.altPhone,
    };
    const profile = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.clientProfile.upsert({
        where: { leadId: id },
        create: { brokerId, leadId: id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "dados_pessoais_alterados",
          entityType: "client_profile",
          entityId: id,
          metadata: { fields: Object.keys(data).filter((k) => data[k as keyof typeof data] != null) },
        },
      });
      return saved;
    });
    return this.toProfileData(profile);
  }

  /** Atualiza (ou cria) o estado atual da negociação. */
  async updateNegotiation(
    brokerId: string,
    id: string,
    dto: UpdateClientNegotiationDto,
  ): Promise<ClientNegotiationData> {
    await this.assertClient(brokerId, id);
    const data = {
      propertyValue: dto.propertyValue != null ? new Prisma.Decimal(dto.propertyValue) : null,
      interestDate: dto.interestDate ? new Date(`${dto.interestDate}T00:00:00Z`) : null,
      expectedTerm: dto.expectedTerm,
      paymentMethod: dto.paymentMethod,
      needsFinancing: dto.needsFinancing ?? null,
      notes: dto.notes,
    };
    const negotiation = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.clientNegotiation.upsert({
        where: { leadId: id },
        create: { brokerId, leadId: id, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          brokerId,
          action: "negociacao_alterada",
          entityType: "client_negotiation",
          entityId: id,
          metadata: { fields: Object.keys(data).filter((k) => data[k as keyof typeof data] != null) },
        },
      });
      return saved;
    });
    return this.toNegotiationData(negotiation);
  }

  private async assertClient(brokerId: string, id: string): Promise<void> {
    const client = await this.prisma.lead.findFirst({
      where: { id, brokerId, isClient: true },
      select: { id: true },
    });
    if (!client) throw new NotFoundException("Cliente não encontrado.");
  }

  private toProfileData(p: ClientProfile): ClientProfileData {
    return {
      cpf: p.cpf,
      rg: p.rg,
      birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
      maritalStatus: p.maritalStatus,
      nationality: p.nationality,
      residenceCountry: p.residenceCountry,
      cep: p.cep,
      street: p.street,
      addressNumber: p.addressNumber,
      complement: p.complement,
      neighborhood: p.neighborhood,
      city: p.city,
      state: p.state,
      altPhone: p.altPhone,
    };
  }

  private toNegotiationData(n: ClientNegotiation): ClientNegotiationData {
    return {
      propertyValue: n.propertyValue != null ? Number(n.propertyValue) : null,
      interestDate: n.interestDate?.toISOString().slice(0, 10) ?? null,
      expectedTerm: n.expectedTerm,
      paymentMethod: n.paymentMethod,
      needsFinancing: n.needsFinancing,
      notes: n.notes,
    };
  }

  private toFinancialData(f: ClientFinancial): ClientFinancialData {
    return {
      incomeType: f.incomeType,
      monthlyIncome: f.monthlyIncome != null ? Number(f.monthlyIncome) : null,
      occupation: f.occupation,
      activityTime: f.activityTime,
      downPayment: f.downPayment != null ? Number(f.downPayment) : null,
      hasFgts: f.hasFgts,
      preferredBank: f.preferredBank,
      hasIncomeComposition: f.hasIncomeComposition,
      dependentsCount: f.dependentsCount,
      notes: f.notes,
    };
  }

  private toParticipant(p: ClientParticipant): ParticipantSummary {
    return {
      id: p.id,
      relation: p.relation,
      fullName: p.fullName,
      cpf: p.cpf,
      phone: p.phone,
      email: p.email,
      notes: p.notes,
    };
  }

  private toDeletionRequest(r: DataDeletionRequest): DeletionRequestSummary {
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      requestedAt: r.requestedAt.toISOString(),
      handledAt: r.handledAt?.toISOString() ?? null,
    };
  }

  private toSummary(lead: LeadWithConversion): ClientSummary {
    return {
      id: lead.id,
      fullName: lead.fullName,
      whatsapp: lead.whatsapp,
      status: lead.status,
      convertedAt: lead.convertedAt?.toISOString() ?? null,
      purpose: lead.conversion?.purpose ?? null,
      reason: lead.conversion?.reason ?? null,
      relatedPropertyId: lead.conversion?.propertyId ?? null,
      relatedPropertyTitle: lead.conversion?.property?.title ?? null,
      nextActionAt: lead.nextActionAt?.toISOString() ?? null,
      lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    };
  }
}
