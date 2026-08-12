import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Readable } from "node:stream";
import { extname } from "node:path";
import type {
  PublicBookVisitDto,
  PublicSelectionInfoDto,
  PublicSelectionItemCard,
  PublicSelectionItemDetailResponse,
  PublicSelectionPageResponse,
  PublicSelectionResponseDto,
  PublicVisitSlotsResponse,
  PublicVisitView,
  SelectionDismissReason,
  SelectionInfoKind,
} from "@nexlar/shared";
import type { Prisma, PropertyMedia, Visit } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { NotificationService } from "../notification/notification.service";
import { ProductEventService } from "../guidance/product-event.service";
import { VisitAvailabilityService } from "../agenda/visit-availability.service";
import { computeVisitDays, spDateTime, type BusyInterval } from "../agenda/visit-slots";
import {
  detalhes,
  montarDetalhePublico,
  precoEfetivo,
  precoLegivel,
} from "../public-page/property-public-view";
import { promoteLeadStage } from "./lead-stage";
import { brokerPublico } from "./sharing.service";

/**
 * A página que a LEAD vê (/selecao/:token) e as ações dela: gostar,
 * descartar com motivo, pedir informação e pedir visita.
 *
 * Regras de ouro:
 * - só seleção ATIVA e dentro do prazo abre; o motivo de indisponibilidade
 *   é sempre genérico e, quando o link já circulou, o corretor continua
 *   alcançável na página de encerrada;
 * - identificação mínima: primeiro nome da lead, nunca telefone, e-mail ou
 *   id interno;
 * - toda ação da lead vira timeline + notificação para o corretor, e o
 *   histórico nunca é apagado (desfazer muda o estado atual, não o passado);
 * - imóvel que saiu de oferta aparece como indisponível, com as ações
 *   bloqueadas, sem sumir da página (Task 43).
 */

type SelectionFull = Prisma.PropertySelectionGetPayload<{
  include: {
    lead: true;
    broker: true;
    items: { include: { property: { include: { media: true } } } };
  };
}>;

const INCLUDE_PUBLIC = {
  lead: true,
  broker: true,
  items: {
    include: {
      property: {
        include: {
          media: {
            where: { status: "pronto" as const },
            orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }],
          },
        },
      },
    },
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.PropertySelectionInclude;

const DISMISS_LABELS: Record<SelectionDismissReason, string> = {
  preco: "preço",
  localizacao: "localização",
  tamanho: "tamanho",
  quartos: "quartos",
  vagas: "vagas",
  estilo: "estilo",
  estado: "estado do imóvel",
  condominio: "condomínio",
  outro: "outro motivo",
};

const INFO_LABELS: Record<SelectionInfoKind, string> = {
  mais_informacoes: "quer mais informações",
  falar_com_corretor: "quer falar com você",
  tenho_duvida: "tem uma dúvida",
  opcoes_semelhantes: "quer opções semelhantes",
};

const dataLonga = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });

/** "sábado, 1 de agosto às 10:00", no fuso do corretor. */
const rotuloVisita = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

@Injectable()
export class SelectionPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
    private readonly events: ProductEventService,
    private readonly availability: VisitAvailabilityService,
  ) {}

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  async getPage(token: string): Promise<PublicSelectionPageResponse> {
    const selection = await this.loadByToken(token);
    if (!selection) {
      return { available: false, unavailableReason: "indisponivel", broker: null, selection: null };
    }

    const reason = await this.unavailableReason(selection);
    if (reason) {
      // Rascunho nunca circulou: nem o corretor sai na página. Nos demais, o
      // contato continua, porque a lead legítima chegou aqui por um link real.
      const broker = selection.status === "rascunho" ? null : brokerPublico(selection.broker);
      return { available: false, unavailableReason: reason, broker, selection: null };
    }

    await this.registerView(selection);
    const visitas = await this.visitsByProperty(selection.brokerId, selection.leadId);

    return {
      available: true,
      unavailableReason: null,
      broker: brokerPublico(selection.broker),
      selection: {
        leadFirstName: primeiroNome(selection.lead.fullName),
        message: selection.message,
        itemCount: selection.items.length,
        expiresAtLabel: selection.expiresAt ? dataLonga.format(selection.expiresAt) : null,
        broker: brokerPublico(selection.broker),
        items: selection.items.map((i) => this.toCard(token, i, visitas)),
      },
    };
  }

  async getItemDetail(token: string, itemId: string): Promise<PublicSelectionItemDetailResponse> {
    const selection = await this.loadByToken(token);
    if (!selection || (await this.unavailableReason(selection))) {
      return { available: false, item: null, broker: null };
    }
    const item = selection.items.find((i) => i.id === itemId);
    if (!item || imovelIndisponivel(item.property.status)) {
      return { available: false, item: null, broker: brokerPublico(selection.broker) };
    }

    return {
      available: true,
      broker: brokerPublico(selection.broker),
      item: {
        itemId: item.id,
        highlight: item.highlight,
        brokerNote: item.brokerNote,
        response: item.response,
        responseReason: item.responseReason,
        visitRequestedAt: item.visitRequestedAt?.toISOString() ?? null,
        property: montarDetalhePublico(item.property, `/api/public/selecoes/${token}/media`),
      },
    };
  }

  /** Foto/vídeo validado por posse: a mídia precisa ser de um imóvel da seleção. */
  async streamMedia(token: string, mediaId: string): Promise<{ stream: Readable; mimeType: string }> {
    const selection = await this.loadByToken(token);
    if (!selection || (await this.unavailableReason(selection))) throw new NotFoundException();

    // A indisponibilidade é POR IMÓVEL: um vendido não derruba as fotos dos
    // outros itens da mesma seleção.
    let media: PropertyMedia | null = null;
    for (const item of selection.items) {
      if (imovelIndisponivel(item.property.status)) continue;
      const found = item.property.media.find(
        (m) => m.id === mediaId && (m.kind === "foto" || m.kind === "video"),
      );
      if (found) {
        media = found;
        break;
      }
    }
    if (!media?.storagePath) throw new NotFoundException();

    const stream = await this.storage.getStream(media.storagePath);
    return { stream, mimeType: media.mimeType ?? mimeDaChave(media.storagePath) };
  }

  // -------------------------------------------------------------------------
  // Ações da lead
  // -------------------------------------------------------------------------

  /** Gostei / talvez / não combina (com motivo) / desfazer. */
  async respond(token: string, itemId: string, dto: PublicSelectionResponseDto): Promise<void> {
    const { selection, item } = await this.actionable(token, itemId);

    // Repetir a mesma resposta é clique duplo, não evento novo.
    if (item.response === dto.response && (item.responseReason ?? null) === (dto.reason ?? null)) {
      return;
    }

    const desfazer = dto.response === "visualizado";
    await this.prisma.$transaction(async (tx) => {
      await tx.selectionItem.update({
        where: { id: item.id },
        data: {
          response: dto.response,
          responseReason: dto.response === "sem_interesse" ? (dto.reason ?? null) : null,
          comment: dto.comment ?? item.comment,
          respondedAt: new Date(),
        },
      });
      await tx.leadActivity.create({
        data: {
          brokerId: selection.brokerId,
          leadId: selection.leadId,
          type: "selecao",
          description: desfazer
            ? `Resposta desfeita: ${item.property.title}`
            : dto.response === "tenho_interesse"
              ? `Gostou do imóvel: ${item.property.title}`
              : dto.response === "talvez"
                ? `Ficou em dúvida: ${item.property.title}`
                : `Não combina (${dto.reason ? DISMISS_LABELS[dto.reason] : "sem motivo"}): ${item.property.title}`,
          metadata: {
            selectionId: selection.id,
            propertyId: item.propertyId,
            response: dto.response,
            reason: dto.reason ?? null,
            origin: "pagina_publica",
          },
        },
      });
      if (!desfazer) {
        await promoteLeadStage(tx, selection.brokerId, selection.leadId, "avaliando_imoveis");
      }
      if (dto.response === "tenho_interesse") {
        await this.events.track(
          selection.brokerId,
          { type: "FIRST_INTEREST_RECEIVED", source: "api", entityType: "selection", entityId: selection.id },
          tx,
        );
      }
      // Evento da jornada: um por resposta efetiva (clique repetido já saiu
      // antes), sem dados pessoais, só referências.
      const tipoDoEvento =
        dto.response === "tenho_interesse"
          ? "SELECTION_PROPERTY_LIKED"
          : dto.response === "sem_interesse"
            ? "SELECTION_PROPERTY_DISMISSED"
            : desfazer
              ? "SELECTION_PROPERTY_UNLIKED"
              : null;
      if (tipoDoEvento) {
        await this.events.track(
          selection.brokerId,
          { type: tipoDoEvento, source: "api", entityType: "selection_item", entityId: item.id },
          tx,
        );
      }
    });

    // Notifica fora da transação: notificação atrasada é melhor que rollback.
    const nome = primeiroNome(selection.lead.fullName);
    const url = `/leads/${selection.leadId}/selecoes/${selection.id}`;
    if (dto.response === "tenho_interesse") {
      await this.notifications.create(
        selection.brokerId,
        "selecao_gostou",
        `${nome} gostou de um imóvel`,
        `${item.property.title}. Aproveite o interesse e chame no WhatsApp.`,
        url,
      );
    } else if (dto.response === "sem_interesse") {
      await this.notifications.create(
        selection.brokerId,
        "selecao_descartou",
        `${nome} descartou um imóvel`,
        `${item.property.title}${dto.reason ? ` · motivo: ${DISMISS_LABELS[dto.reason]}` : ""}.`,
        url,
      );
      // Ela descartou TUDO: o corretor precisa saber na hora, porque a
      // próxima ação é dele (nova seleção com o que aprendeu dos motivos).
      const restantes = await this.prisma.selectionItem.count({
        where: { selectionId: selection.id, response: { not: "sem_interesse" } },
      });
      if (restantes === 0 && selection.items.length > 1) {
        await this.notifications.create(
          selection.brokerId,
          "selecao_todos_descartados",
          `${nome} descartou todos os imóveis`,
          "Os motivos estão na ficha. Vale montar uma nova seleção com o que ela contou.",
          url,
        );
      }
    }
  }

  /** Pedido de mais informações: vira pendência na mão do corretor. */
  async requestInfo(token: string, itemId: string, dto: PublicSelectionInfoDto): Promise<void> {
    const { selection, item } = await this.actionable(token, itemId);

    await this.prisma.leadActivity.create({
      data: {
        brokerId: selection.brokerId,
        leadId: selection.leadId,
        type: "selecao",
        description: `Pediu informações (${INFO_LABELS[dto.kind]}): ${item.property.title}`,
        metadata: {
          selectionId: selection.id,
          propertyId: item.propertyId,
          kind: dto.kind,
          message: dto.message ?? null,
          origin: "pagina_publica",
        },
      },
    });
    await this.events.track(selection.brokerId, {
      type: "SELECTION_INFORMATION_REQUESTED",
      source: "api",
      entityType: "selection_item",
      entityId: item.id,
    });
    const nome = primeiroNome(selection.lead.fullName);
    await this.notifications.create(
      selection.brokerId,
      "selecao_informacoes",
      `${nome} ${INFO_LABELS[dto.kind]}`,
      `${item.property.title}${dto.message ? ` · "${dto.message}"` : ""}`,
      `/leads/${selection.leadId}/selecoes/${selection.id}`,
    );
  }

  /**
   * Pedido de visita. Sem agenda configurada (a integração de slots é de
   * outra fatia), a regra honesta é: registrar a solicitação e o corretor
   * confirma o melhor horário. Nunca inventamos disponibilidade.
   */
  async requestVisit(token: string, itemId: string): Promise<void> {
    const { selection, item } = await this.actionable(token, itemId);

    // Já pediu: clique repetido não duplica pendência nem notificação.
    if (item.visitRequestedAt) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.selectionItem.update({
        where: { id: item.id },
        data: { response: "quero_visitar", respondedAt: new Date(), visitRequestedAt: new Date() },
      });
      await tx.leadActivity.create({
        data: {
          brokerId: selection.brokerId,
          leadId: selection.leadId,
          type: "selecao",
          description: `Quer visitar: ${item.property.title}`,
          metadata: { selectionId: selection.id, propertyId: item.propertyId, origin: "pagina_publica" },
        },
      });
      await promoteLeadStage(tx, selection.brokerId, selection.leadId, "visita_solicitada");
      await this.events.track(
        selection.brokerId,
        { type: "FIRST_INTEREST_RECEIVED", source: "api", entityType: "selection", entityId: selection.id },
        tx,
      );
      await this.events.track(
        selection.brokerId,
        {
          type: "SELECTION_VISIT_REQUESTED",
          source: "api",
          entityType: "selection_item",
          entityId: item.id,
          dedupeKey: `SELECTION_VISIT_REQUESTED:${item.id}`,
        },
        tx,
      );
    });

    const nome = primeiroNome(selection.lead.fullName);
    await this.notifications.create(
      selection.brokerId,
      "selecao_visita",
      `${nome} quer visitar um imóvel`,
      `${item.property.title}. Entre em contato para combinar o horário.`,
      `/leads/${selection.leadId}/selecoes/${selection.id}`,
    );
  }

  // -------------------------------------------------------------------------
  // Agendamento de visita com horários reais
  // -------------------------------------------------------------------------

  /** Horários livres para visitar este imóvel, direto da agenda do corretor. */
  async getVisitSlots(token: string, itemId: string): Promise<PublicVisitSlotsResponse> {
    const { selection } = await this.actionable(token, itemId);
    const config = await this.availability.get(selection.brokerId);
    if (!config.configured) {
      return { available: true, configured: false, durationMin: config.slotDurationMin, days: [] };
    }

    const agora = new Date();
    const busy = await this.busyIntervals(selection.brokerId, agora, config.maxAdvanceDays, config.slotDurationMin);
    return {
      available: true,
      configured: true,
      durationMin: config.slotDurationMin,
      days: computeVisitDays(config, agora, busy),
    };
  }

  /**
   * A lead confirma dia e hora. O slot é revalidado DENTRO da transação, com
   * trava por corretor: duas leads no mesmo horário, uma agenda e a outra
   * recebe 409 com a instrução de escolher outro. Nada de double booking.
   */
  async bookVisit(token: string, itemId: string, dto: PublicBookVisitDto): Promise<PublicVisitView> {
    const { selection, item } = await this.actionable(token, itemId);
    const config = await this.availability.get(selection.brokerId);
    if (!config.configured) {
      throw new ConflictException("A agenda deste corretor não está configurada para agendamento.");
    }

    const inicio = spDateTime(dto.date, dto.time);
    const fim = new Date(inicio.getTime() + config.slotDurationMin * 60_000);

    // O horário precisa ser um slot legítimo (janela + antecedência), não só
    // um instante livre: a lead não escolhe 03:00 da manhã via API.
    const agora = new Date();
    const dias = computeVisitDays(config, agora, []);
    const slotValido = dias.some((d) => d.date === dto.date && d.slots.includes(dto.time));
    if (!slotValido) {
      throw new ConflictException("Esse horário não está disponível. Escolha outro, por favor.");
    }

    const visita = await this.prisma.$transaction(async (tx) => {
      // Trava por corretor: serializa agendamentos concorrentes do mesmo dono.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${selection.brokerId}))`;

      const ocupados = await this.hasConflictTx(tx, selection.brokerId, inicio, fim, config.slotDurationMin);
      if (ocupados) {
        throw new ConflictException("Esse horário acabou de ser reservado. Escolha outro, por favor.");
      }

      const visit = await tx.visit.create({
        data: {
          brokerId: selection.brokerId,
          leadId: selection.leadId,
          scheduledAt: inicio,
          status: "agendada",
          properties: { create: { propertyId: item.propertyId } },
        },
      });
      await tx.agendaEvent.create({
        data: {
          brokerId: selection.brokerId,
          type: "visita",
          status: "confirmada",
          title: `Visita: ${item.property.title}`,
          leadId: selection.leadId,
          propertyId: item.propertyId,
          visitId: visit.id,
          startAt: inicio,
          endAt: fim,
        },
      });
      await tx.selectionItem.update({
        where: { id: item.id },
        data: { response: "quero_visitar", respondedAt: agora, visitRequestedAt: item.visitRequestedAt ?? agora },
      });
      await tx.leadActivity.create({
        data: {
          brokerId: selection.brokerId,
          leadId: selection.leadId,
          type: "visita",
          description: `Visita agendada pela lead: ${item.property.title} em ${rotuloVisita.format(inicio)}`,
          metadata: {
            selectionId: selection.id,
            propertyId: item.propertyId,
            visitId: visit.id,
            origin: "pagina_publica",
          },
        },
      });
      await promoteLeadStage(tx, selection.brokerId, selection.leadId, "visita_agendada");
      await this.events.track(
        selection.brokerId,
        { type: "FIRST_INTEREST_RECEIVED", source: "api", entityType: "selection", entityId: selection.id },
        tx,
      );
      await this.events.track(
        selection.brokerId,
        { type: "FIRST_VISIT_SCHEDULED", source: "api", entityType: "visit", entityId: visit.id },
        tx,
      );
      await this.events.track(
        selection.brokerId,
        { type: "SELECTION_VISIT_SCHEDULED", source: "api", entityType: "visit", entityId: visit.id },
        tx,
      );
      return visit;
    });

    await this.notifications.create(
      selection.brokerId,
      "selecao_visita_agendada",
      `${primeiroNome(selection.lead.fullName)} agendou uma visita`,
      `${item.property.title} · ${rotuloVisita.format(visita.scheduledAt)}. Já está na sua agenda.`,
      `/agenda`,
    );

    return this.toVisitView(visita);
  }

  /** A lead cancela a visita agendada. O interesse no imóvel permanece. */
  async cancelVisit(token: string, itemId: string): Promise<void> {
    const { selection, item } = await this.actionable(token, itemId);
    const visita = await this.activeVisit(selection.brokerId, selection.leadId, item.propertyId);
    if (!visita) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.visit.update({ where: { id: visita.id }, data: { status: "cancelada" } });
      await tx.agendaEvent.updateMany({
        where: { visitId: visita.id, status: { not: "cancelada" } },
        data: { status: "cancelada" },
      });
      // O gostar continua registrado; só a visita sai da mesa.
      await tx.selectionItem.update({
        where: { id: item.id },
        data: { response: "tenho_interesse", visitRequestedAt: null },
      });
      await tx.leadActivity.create({
        data: {
          brokerId: selection.brokerId,
          leadId: selection.leadId,
          type: "visita",
          description: `Visita cancelada pela lead: ${item.property.title}`,
          metadata: { selectionId: selection.id, propertyId: item.propertyId, visitId: visita.id, origin: "pagina_publica" },
        },
      });
      await this.events.track(
        selection.brokerId,
        { type: "SELECTION_VISIT_CANCELLED", source: "api", entityType: "visit", entityId: visita.id },
        tx,
      );
    });

    await this.notifications.create(
      selection.brokerId,
      "selecao_visita_cancelada",
      `${primeiroNome(selection.lead.fullName)} cancelou a visita`,
      `${item.property.title} · era ${rotuloVisita.format(visita.scheduledAt)}. O interesse no imóvel continua registrado.`,
      `/leads/${selection.leadId}/selecoes/${selection.id}`,
    );
  }

  /** Intervalos ocupados do corretor no horizonte: agenda + visitas. */
  private async busyIntervals(
    brokerId: string,
    agora: Date,
    maxAdvanceDays: number,
    slotDurationMin: number,
  ): Promise<BusyInterval[]> {
    const fim = new Date(agora.getTime() + (maxAdvanceDays + 1) * 86_400_000);
    const [eventos, visitas] = await Promise.all([
      this.prisma.agendaEvent.findMany({
        where: {
          brokerId,
          type: { in: ["visita", "compromisso", "bloqueio", "google_ocupado"] },
          status: { notIn: ["cancelada"] },
          startAt: { lt: fim },
        },
        select: { startAt: true, endAt: true },
      }),
      // Visita criada à mão na tela de visitas não tem evento: entra também.
      this.prisma.visit.findMany({
        where: { brokerId, status: "agendada", scheduledAt: { gte: agora, lt: fim } },
        select: { scheduledAt: true },
      }),
    ]);
    return [
      ...eventos.map((e) => ({
        start: e.startAt,
        end: e.endAt ?? new Date(e.startAt.getTime() + slotDurationMin * 60_000),
      })),
      ...visitas.map((v) => ({
        start: v.scheduledAt,
        end: new Date(v.scheduledAt.getTime() + slotDurationMin * 60_000),
      })),
    ];
  }

  /** Existe algo do corretor encostando neste intervalo? (dentro da transação) */
  private async hasConflictTx(
    tx: Prisma.TransactionClient,
    brokerId: string,
    inicio: Date,
    fim: Date,
    slotDurationMin: number,
  ): Promise<boolean> {
    const evento = await tx.agendaEvent.findFirst({
      where: {
        brokerId,
        type: { in: ["visita", "compromisso", "bloqueio", "google_ocupado"] },
        status: { notIn: ["cancelada"] },
        startAt: { lt: fim },
        OR: [{ endAt: { gt: inicio } }, { endAt: null, startAt: { gte: inicio } }],
      },
      select: { id: true },
    });
    if (evento) return true;

    // Visita sem evento (criada à mão): ocupa scheduledAt + duração do slot.
    const margem = new Date(inicio.getTime() - slotDurationMin * 60_000);
    const visita = await tx.visit.findFirst({
      where: { brokerId, status: "agendada", scheduledAt: { gt: margem, lt: fim } },
      select: { id: true },
    });
    return visita != null;
  }

  /** A visita futura ainda de pé desta lead para este imóvel. */
  private activeVisit(brokerId: string, leadId: string, propertyId: string): Promise<Visit | null> {
    return this.prisma.visit.findFirst({
      where: {
        brokerId,
        leadId,
        status: "agendada",
        scheduledAt: { gte: new Date() },
        properties: { some: { propertyId } },
      },
      orderBy: { scheduledAt: "asc" },
    });
  }

  private toVisitView(v: Visit): PublicVisitView {
    return {
      visitId: v.id,
      scheduledAt: v.scheduledAt.toISOString(),
      scheduledAtLabel: rotuloVisita.format(v.scheduledAt),
    };
  }

  // -------------------------------------------------------------------------
  // Prévia do corretor (rascunho, autenticada)
  // -------------------------------------------------------------------------

  /**
   * A mesma página que a lead verá, montada do rascunho, sem contar acesso e
   * sem exigir ativação: a prévia existe para ver ANTES de enviar. As mídias
   * saem pela rota administrativa, porque quem olha é o dono logado.
   */
  async preview(brokerId: string, selectionId: string): Promise<PublicSelectionPageResponse> {
    const selection = await this.prisma.propertySelection.findFirst({
      where: { id: selectionId, brokerId },
      include: INCLUDE_PUBLIC,
    });
    if (!selection) throw new NotFoundException("Seleção não encontrada.");

    return {
      available: true,
      unavailableReason: null,
      broker: brokerPublico(selection.broker),
      selection: {
        leadFirstName: primeiroNome(selection.lead.fullName),
        message: selection.message,
        itemCount: selection.items.length,
        expiresAtLabel: selection.expiresAt
          ? dataLonga.format(selection.expiresAt)
          : selection.expiresInDays
            ? dataLonga.format(new Date(Date.now() + selection.expiresInDays * 86_400_000))
            : null,
        broker: brokerPublico(selection.broker),
        items: selection.items.map((i) => this.toCard(null, i)),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private loadByToken(token: string): Promise<SelectionFull | null> {
    return this.prisma.propertySelection.findUnique({
      where: { publicToken: token },
      include: INCLUDE_PUBLIC,
    });
  }

  /** Só ativa e no prazo abre. Vencida é persistida como expirada na hora. */
  private async unavailableReason(
    s: SelectionFull,
  ): Promise<"expirado" | "revogado" | "indisponivel" | null> {
    if (s.status === "ativa" && s.expiresAt && s.expiresAt.getTime() < Date.now()) {
      await this.prisma.propertySelection.update({ where: { id: s.id }, data: { status: "expirada" } });
      return "expirado";
    }
    if (s.status === "ativa") return null;
    if (s.status === "expirada") return "expirado";
    if (s.status === "revogada") return "revogado";
    return "indisponivel"; // rascunho e arquivada, sem detalhar
  }

  /** Conta o acesso; a primeira abertura avisa o corretor e move o funil. */
  private async registerView(s: SelectionFull): Promise<void> {
    const primeira = s.viewedAt == null;
    await this.prisma.$transaction(async (tx) => {
      await tx.propertySelection.update({
        where: { id: s.id },
        data: {
          viewCount: { increment: 1 },
          lastAccessAt: new Date(),
          viewedAt: s.viewedAt ?? new Date(),
        },
      });
      await tx.selectionItem.updateMany({
        where: { selectionId: s.id, response: "nao_visualizado" },
        data: { response: "visualizado", respondedAt: new Date() },
      });
      await promoteLeadStage(tx, s.brokerId, s.leadId, "avaliando_imoveis");
    });

    if (primeira) {
      await this.events.track(s.brokerId, {
        type: "SELECTION_OPENED",
        source: "api",
        entityType: "selection",
        entityId: s.id,
        dedupeKey: `SELECTION_OPENED:${s.id}`,
      });
      await this.events.track(s.brokerId, {
        type: "FIRST_LINK_VIEWED",
        source: "api",
        entityType: "selection",
        entityId: s.id,
      });
      await this.notifications.create(
        s.brokerId,
        "selecao_aberta",
        `${primeiroNome(s.lead.fullName)} abriu a seleção`,
        `A seleção de ${s.items.length} ${s.items.length === 1 ? "imóvel" : "imóveis"} foi visualizada pela primeira vez.`,
        `/leads/${s.leadId}/selecoes/${s.id}`,
      );
    }
  }

  /** Item apto a receber ação: seleção aberta e imóvel ainda em oferta. */
  private async actionable(token: string, itemId: string) {
    const selection = await this.loadByToken(token);
    if (!selection || (await this.unavailableReason(selection))) {
      throw new NotFoundException("Seleção não disponível.");
    }
    const item = selection.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Imóvel não encontrado nesta seleção.");
    if (imovelIndisponivel(item.property.status)) {
      throw new NotFoundException("Este imóvel não está mais disponível.");
    }
    return { selection, item };
  }

  /** Visitas futuras ainda de pé da lead, por imóvel (a mais próxima). */
  private async visitsByProperty(brokerId: string, leadId: string): Promise<Map<string, PublicVisitView>> {
    const visitas = await this.prisma.visit.findMany({
      where: { brokerId, leadId, status: "agendada", scheduledAt: { gte: new Date() } },
      include: { properties: { select: { propertyId: true } } },
      orderBy: { scheduledAt: "asc" },
    });
    const porImovel = new Map<string, PublicVisitView>();
    for (const v of visitas) {
      for (const p of v.properties) {
        if (!porImovel.has(p.propertyId)) porImovel.set(p.propertyId, this.toVisitView(v));
      }
    }
    return porImovel;
  }

  /** `token` nulo = prévia autenticada: mídias pela rota administrativa. */
  private toCard(
    token: string | null,
    item: SelectionFull["items"][number],
    visitas?: Map<string, PublicVisitView>,
  ): PublicSelectionItemCard {
    const p = item.property;
    const d = detalhes(p);
    const capa = p.media.find((m) => m.kind === "foto") ?? null;
    return {
      itemId: item.id,
      code: p.code,
      title: p.title,
      type: p.type,
      purpose: p.purpose,
      priceLabel: precoLegivel(p.purpose, precoEfetivo(p)),
      locationLine: [p.neighborhood, p.city].filter(Boolean).join(", ") || null,
      coverUrl: capa
        ? token
          ? `/api/public/selecoes/${token}/media/${capa.id}`
          : `/api/properties/${p.id}/media/${capa.id}/file`
        : null,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      parkingSpots: d.parkingSpots,
      area: d.area,
      highlight: item.highlight,
      brokerNote: item.brokerNote,
      response: item.response,
      responseReason: item.responseReason,
      visitRequestedAt: item.visitRequestedAt?.toISOString() ?? null,
      visit: visitas?.get(p.id) ?? null,
      unavailable: imovelIndisponivel(p.status),
    };
  }
}

/** Vendido/alugado/arquivado/indisponível: card fica, ações saem. */
function imovelIndisponivel(status: string): boolean {
  return (
    status === "vendido" ||
    status === "alugado" ||
    status === "arquivado" ||
    status === "temporariamente_indisponivel" ||
    status === "rascunho"
  );
}

/** Minimização: a página aberta por token só conhece o primeiro nome. */
function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] ?? "";
}

function mimeDaChave(chave: string): string {
  const ext = extname(chave).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "image/jpeg";
}
