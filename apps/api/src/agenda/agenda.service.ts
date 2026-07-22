import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AgendaEventSummary,
  AgendaListQuery,
  AgendaSummary,
  CreateAgendaEventDto,
  UpdateAgendaEventDto,
} from "@nexlar/shared";
import { Prisma, type AgendaEvent, type AgendaEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type AgendaEventWithRelations = AgendaEvent & {
  lead: { fullName: string } | null;
  property: { title: string } | null;
};

const WITH_RELATIONS = {
  lead: { select: { fullName: true } },
  property: { select: { title: true } },
} as const;

/** Status que contam como "encerrado" e não geram alerta nem conflito. */
const CLOSED_STATUSES = ["concluida", "cancelada", "realizada", "nao_compareceu"] as const;

/** Tipos que ocupam horário e disputam conflito na agenda. */
const BLOCKING_TYPES: AgendaEventType[] = ["visita", "compromisso", "bloqueio", "google_ocupado"];

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista eventos do corretor no período, aplicando filtros. */
  async list(brokerId: string, query: AgendaListQuery): Promise<AgendaEventSummary[]> {
    const where: Prisma.AgendaEventWhereInput = { brokerId };

    if (query.from || query.to) {
      where.startAt = {};
      if (query.from) where.startAt.gte = new Date(query.from);
      if (query.to) where.startAt.lte = new Date(query.to);
    }
    if (query.type) where.type = query.type;
    if (query.leadId) where.leadId = query.leadId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    if (query.done === true) where.status = "concluida";
    if (query.done === false) where.status = { notIn: ["concluida"] };
    if (query.overdue) {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      where.type = "tarefa";
      where.status = "pendente";
      where.OR = this.overdueClause(now, startOfDay);
    }

    const events = await this.prisma.agendaEvent.findMany({
      where,
      include: WITH_RELATIONS,
      orderBy: { startAt: "asc" },
    });
    return events.map((e) => this.toSummary(e));
  }

  /** Contadores do resumo operacional (indicadores clicáveis). */
  async summary(brokerId: string): Promise<AgendaSummary> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const [overdueTasks, todayTasks, todayVisits, pendingVisitRequests] = await Promise.all([
      this.prisma.agendaEvent.count({
        where: {
          brokerId,
          type: "tarefa",
          status: "pendente",
          OR: this.overdueClause(now, startOfDay),
        },
      }),
      this.prisma.agendaEvent.count({
        where: {
          brokerId,
          type: "tarefa",
          status: "pendente",
          startAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      this.prisma.agendaEvent.count({
        where: {
          brokerId,
          type: "visita",
          status: { notIn: [...CLOSED_STATUSES] },
          startAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      this.prisma.agendaEvent.count({
        where: {
          brokerId,
          type: "visita",
          status: { in: ["solicitada", "aguardando_confirmacao"] },
        },
      }),
    ]);

    return { overdueTasks, todayTasks, todayVisits, pendingVisitRequests };
  }

  async findOne(brokerId: string, id: string): Promise<AgendaEventSummary> {
    const event = await this.prisma.agendaEvent.findFirst({
      where: { id, brokerId },
      include: WITH_RELATIONS,
    });
    if (!event) throw new NotFoundException("Compromisso não encontrado.");
    return this.toSummary(event);
  }

  /**
   * Cria tarefa ou compromisso. Regras no back: vínculo de lead/imóvel precisa
   * pertencer ao corretor; horário em conflito é recusado (409) a menos que o
   * corretor confirme com force. Ao criar tarefa ligada a lead, a próxima ação
   * da lead é recomputada para o funil ficar coerente.
   */
  async create(brokerId: string, dto: CreateAgendaEventDto): Promise<AgendaEventSummary> {
    await this.assertLinksBelongToBroker(brokerId, dto.leadId, dto.propertyId);

    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    const status = dto.type === "tarefa" ? "pendente" : "agendado";

    if (!dto.force && this.occupiesTime(dto.type, dto.allDay ?? false, endAt)) {
      const conflicts = await this.findConflicts(brokerId, startAt, endAt);
      if (conflicts.length > 0) this.throwConflict(conflicts);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.agendaEvent.create({
        data: {
          brokerId,
          type: dto.type,
          leadId: dto.leadId,
          propertyId: dto.propertyId,
          title: dto.title,
          description: dto.description,
          location: dto.location,
          startAt,
          endAt,
          allDay: dto.allDay ?? false,
          status,
          taskKind: dto.type === "tarefa" ? dto.taskKind : null,
          reminderMinutes: dto.reminderMinutes,
        },
        include: WITH_RELATIONS,
      });
      if (dto.leadId) await this.recomputeLeadNextAction(tx, brokerId, dto.leadId);
      return event;
    });

    return this.toSummary(created);
  }

  /** Edita, reagenda, conclui ou cancela um evento. */
  async update(
    brokerId: string,
    id: string,
    dto: UpdateAgendaEventDto,
  ): Promise<AgendaEventSummary> {
    const current = await this.prisma.agendaEvent.findFirst({ where: { id, brokerId } });
    if (!current) throw new NotFoundException("Compromisso não encontrado.");

    await this.assertLinksBelongToBroker(brokerId, dto.leadId ?? undefined, dto.propertyId ?? undefined);

    const nextStart = dto.startAt ? new Date(dto.startAt) : current.startAt;
    const nextEnd =
      dto.endAt === undefined ? current.endAt : dto.endAt === null ? null : new Date(dto.endAt);
    const nextAllDay = dto.allDay ?? current.allDay;
    const nextType = current.type;

    const reschedulingOrTiming =
      dto.startAt !== undefined || dto.endAt !== undefined || dto.allDay !== undefined;
    const stillOpen = !dto.status || !CLOSED_STATUSES.includes(dto.status as never);
    if (!dto.force && reschedulingOrTiming && stillOpen && this.occupiesTime(nextType, nextAllDay, nextEnd)) {
      const conflicts = await this.findConflicts(brokerId, nextStart, nextEnd, id);
      if (conflicts.length > 0) this.throwConflict(conflicts);
    }

    const completedAt =
      dto.status === "concluida" || dto.status === "realizada"
        ? current.completedAt ?? new Date()
        : dto.status
          ? null
          : current.completedAt;

    const updated = await this.prisma.$transaction(async (tx) => {
      const event = await tx.agendaEvent.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          location: dto.location,
          startAt: dto.startAt ? nextStart : undefined,
          endAt: dto.endAt === undefined ? undefined : nextEnd,
          allDay: dto.allDay,
          status: dto.status,
          taskKind: dto.taskKind === undefined ? undefined : dto.taskKind,
          reminderMinutes: dto.reminderMinutes === undefined ? undefined : dto.reminderMinutes,
          leadId: dto.leadId === undefined ? undefined : dto.leadId,
          propertyId: dto.propertyId === undefined ? undefined : dto.propertyId,
          completedAt,
        },
        include: WITH_RELATIONS,
      });
      const leadsToTouch = new Set(
        [current.leadId, event.leadId].filter((v): v is string => Boolean(v)),
      );
      for (const leadId of leadsToTouch) {
        await this.recomputeLeadNextAction(tx, brokerId, leadId);
      }
      return event;
    });

    return this.toSummary(updated);
  }

  async remove(brokerId: string, id: string): Promise<void> {
    const event = await this.prisma.agendaEvent.findFirst({ where: { id, brokerId } });
    if (!event) throw new NotFoundException("Compromisso não encontrado.");
    await this.prisma.$transaction(async (tx) => {
      await tx.agendaEvent.delete({ where: { id } });
      if (event.leadId) await this.recomputeLeadNextAction(tx, brokerId, event.leadId);
    });
  }

  /**
   * Tarefa atrasada: com horário, passou do instante; de dia inteiro, só depois
   * que o dia virou (uma tarefa "de hoje" sem horário não é atrasada).
   */
  private overdueClause(now: Date, startOfDay: Date): Prisma.AgendaEventWhereInput[] {
    return [
      { allDay: false, startAt: { lt: now } },
      { allDay: true, startAt: { lt: startOfDay } },
    ];
  }

  // --- regras internas -------------------------------------------------------

  /** Um evento ocupa horário quando tem duração e não é tarefa de dia inteiro. */
  private occupiesTime(type: AgendaEventType, allDay: boolean, endAt: Date | null): boolean {
    if (allDay) return false;
    if (type === "tarefa") return false;
    return endAt != null;
  }

  /** Eventos do corretor que se sobrepõem ao intervalo [start, end). */
  private async findConflicts(
    brokerId: string,
    start: Date,
    end: Date | null,
    ignoreId?: string,
  ): Promise<AgendaEventSummary[]> {
    if (!end) return [];
    const overlapping = await this.prisma.agendaEvent.findMany({
      where: {
        brokerId,
        id: ignoreId ? { not: ignoreId } : undefined,
        type: { in: BLOCKING_TYPES },
        status: { notIn: [...CLOSED_STATUSES] },
        allDay: false,
        endAt: { not: null, gt: start },
        startAt: { lt: end },
      },
      include: WITH_RELATIONS,
      orderBy: { startAt: "asc" },
      take: 5,
    });
    return overlapping.map((e) => this.toSummary(e));
  }

  private throwConflict(conflicts: AgendaEventSummary[]): never {
    throw new ConflictException({
      message: "Este horário parece estar ocupado. Escolha outro horário ou confirme que deseja continuar.",
      details: { conflicts },
    });
  }

  private async assertLinksBelongToBroker(
    brokerId: string,
    leadId?: string,
    propertyId?: string,
  ): Promise<void> {
    if (leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: leadId, brokerId } });
      if (!lead) throw new NotFoundException("Lead não encontrado.");
    }
    if (propertyId) {
      const property = await this.prisma.property.findFirst({ where: { id: propertyId, brokerId } });
      if (!property) throw new NotFoundException("Imóvel não encontrado.");
    }
  }

  /**
   * Recalcula lead.nextActionAt = início da próxima tarefa/visita em aberto da
   * lead. Mantém o funil ("próxima ação", "atrasada") coerente com a agenda.
   */
  private async recomputeLeadNextAction(
    tx: Prisma.TransactionClient,
    brokerId: string,
    leadId: string,
  ): Promise<void> {
    const next = await tx.agendaEvent.findFirst({
      where: {
        brokerId,
        leadId,
        type: { in: ["tarefa", "visita"] },
        status: { notIn: [...CLOSED_STATUSES] },
      },
      orderBy: { startAt: "asc" },
      select: { startAt: true },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: { nextActionAt: next?.startAt ?? null },
    });
  }

  private toSummary(event: AgendaEventWithRelations): AgendaEventSummary {
    return {
      id: event.id,
      type: event.type,
      leadId: event.leadId,
      leadName: event.lead?.fullName ?? null,
      propertyId: event.propertyId,
      propertyTitle: event.property?.title ?? null,
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? null,
      allDay: event.allDay,
      status: event.status,
      taskKind: event.taskKind as AgendaEventSummary["taskKind"],
      reminderMinutes: event.reminderMinutes,
      source: event.source,
      syncStatus: event.syncStatus,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
