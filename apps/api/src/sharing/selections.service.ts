import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AddSelectionItemDto,
  CreateSelectionDto,
  ReorderSelectionItemsDto,
  SelectionExpiryDays,
  SelectionItemView,
  SelectionStatus,
  SelectionSummary,
  SelectionView,
  UpdateSelectionDto,
  UpdateSelectionItemDto,
} from "@nexlar/shared";
import { SELECTION_EXPIRY_OPTIONS, SELECTION_MAX_HIGHLIGHTS } from "@nexlar/shared";
import { Prisma, type Property } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "../guidance/product-event.service";
import { avaliarCompatibilidade } from "./selection-compatibility";

/**
 * Seleção personalizada de imóveis: a curadoria do corretor para uma lead.
 *
 * Aqui mora a máquina de estados. O front nunca muda status diretamente:
 * cada transição é um endpoint próprio, validado e auditado na timeline.
 *
 *   rascunho -> ativa | arquivada
 *   ativa    -> expirada | revogada | arquivada
 *   expirada -> arquivada
 *   revogada -> arquivada
 *
 * A expiração é avaliada sob demanda: qualquer leitura que encontre uma
 * ativa com prazo vencido persiste "expirada" antes de responder. Não há
 * job; o relógio do banco decide, nunca o front.
 */

type SelectionRecord = Prisma.PropertySelectionGetPayload<{
  include: { lead: true; items: { include: { property: { include: { media: true } } } } };
}>;

const INCLUDE_FULL = {
  lead: true,
  items: {
    include: { property: { include: { media: true } } },
    orderBy: { position: "asc" as const },
  },
} satisfies Prisma.PropertySelectionInclude;

/** Transições permitidas. Tudo fora daqui é 409. */
const TRANSITIONS: Record<SelectionStatus, SelectionStatus[]> = {
  rascunho: ["ativa", "arquivada"],
  ativa: ["expirada", "revogada", "arquivada"],
  expirada: ["arquivada"],
  revogada: ["arquivada"],
  arquivada: [],
};

@Injectable()
export class SelectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
  ) {}

  /** Evento da jornada, deduplicado por seleção: reprocessar não duplica. */
  private trackSelection(
    brokerId: string,
    type: "SELECTION_CREATED" | "SELECTION_ACTIVATED" | "SELECTION_SENT" | "SELECTION_REVOKED" | "SELECTION_EXPIRED",
    selectionId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.events.track(
      brokerId,
      { type, source: "ui", entityType: "selection", entityId: selectionId, dedupeKey: `${type}:${selectionId}` },
      tx,
    );
  }

  // -------------------------------------------------------------------------
  // Criação e edição do rascunho
  // -------------------------------------------------------------------------

  async create(brokerId: string, dto: CreateSelectionDto): Promise<SelectionView> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, brokerId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException("Lead não encontrada.");

    // Fluxo que nasce na carteira: os imóveis marcados em /imoveis já entram
    // como itens do rascunho. Validação em bloco ANTES de criar qualquer
    // coisa: id de outro corretor ou imóvel arquivado recusa a operação
    // inteira, para o corretor nunca enviar uma seleção pela metade sem ver.
    const ids = [...new Set(dto.propertyIds ?? [])];
    let properties: Property[] = [];
    if (ids.length > 0) {
      properties = await this.prisma.property.findMany({ where: { id: { in: ids }, brokerId } });
      if (properties.length !== ids.length) {
        throw new NotFoundException("Imóvel não encontrado.");
      }
      if (properties.some((p) => p.status === "arquivado")) {
        throw new BadRequestException("Imóvel arquivado não pode entrar numa seleção.");
      }
      // A ordem dos itens é a ordem em que o corretor marcou.
      properties.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }

    // A compatibilidade é fotografada na inclusão, igual ao addItem.
    const pref =
      properties.length > 0
        ? await this.prisma.leadPreference.findFirst({ where: { leadId: lead.id, brokerId } })
        : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const selection = await tx.propertySelection.create({
        data: {
          brokerId,
          leadId: lead.id,
          // 16 bytes = 22 caracteres no link. Curto o bastante para o WhatsApp,
          // e ainda 2^128 possibilidades: adivinhar continua impossível.
          publicToken: randomBytes(16).toString("base64url"),
          status: "rascunho",
        },
      });
      if (properties.length > 0) {
        await tx.selectionItem.createMany({
          data: properties.map((property, position) => {
            const veredito = avaliarCompatibilidade(pref, property);
            return {
              brokerId,
              selectionId: selection.id,
              propertyId: property.id,
              position,
              origin: "manual" as const,
              compatibility: veredito?.level ?? null,
            };
          }),
        });
      }
      return tx.propertySelection.findUniqueOrThrow({
        where: { id: selection.id },
        include: INCLUDE_FULL,
      });
    });

    await this.trackSelection(brokerId, "SELECTION_CREATED", created.id);
    return this.toView(created);
  }

  async get(brokerId: string, id: string): Promise<SelectionView> {
    const selection = await this.owned(brokerId, id);
    return this.toView(await this.expireIfDue(selection));
  }

  /** Histórico de seleções da lead, mais recente primeiro. */
  async listForLead(brokerId: string, leadId: string): Promise<SelectionSummary[]> {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, brokerId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Lead não encontrada.");

    // Expira as vencidas da lead antes de listar, para o histórico não mentir.
    await this.prisma.propertySelection.updateMany({
      where: { brokerId, leadId, status: "ativa", expiresAt: { lt: new Date() } },
      data: { status: "expirada" },
    });

    const selections = await this.prisma.propertySelection.findMany({
      where: { brokerId, leadId },
      include: { items: { select: { response: true, visitRequestedAt: true } } },
      orderBy: { createdAt: "desc" },
    });
    return selections.map((s) => ({
      id: s.id,
      code: s.code,
      status: s.status,
      itemCount: s.items.length,
      likedCount: s.items.filter((i) => i.response === "tenho_interesse").length,
      dismissedCount: s.items.filter((i) => i.response === "sem_interesse").length,
      visitRequestedCount: s.items.filter((i) => i.visitRequestedAt != null).length,
      activatedAt: s.activatedAt?.toISOString() ?? null,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      viewedAt: s.viewedAt?.toISOString() ?? null,
      viewCount: s.viewCount,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Mensagem e prazo. O prazo só é editável no rascunho: depois de ativa,
   * alterá-lo renovaria o acesso, e a regra é que edição nunca renova prazo.
   */
  async update(brokerId: string, id: string, dto: UpdateSelectionDto): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    if (selection.status === "arquivada" || selection.status === "revogada" || selection.status === "expirada") {
      throw new ConflictException("Esta seleção está encerrada e não pode ser editada.");
    }
    if (dto.expiresInDays !== undefined && selection.status !== "rascunho") {
      throw new BadRequestException("O prazo só pode ser alterado enquanto a seleção é rascunho.");
    }

    const updated = await this.prisma.propertySelection.update({
      where: { id: selection.id },
      data: {
        ...(dto.message !== undefined ? { message: dto.message ?? null } : {}),
        ...(dto.expiresInDays !== undefined ? { expiresInDays: dto.expiresInDays ?? null } : {}),
      },
      include: INCLUDE_FULL,
    });
    return this.toView(updated);
  }

  // -------------------------------------------------------------------------
  // Itens
  // -------------------------------------------------------------------------

  async addItem(brokerId: string, id: string, dto: AddSelectionItemDto): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertEditableItems(selection.status);

    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, brokerId },
    });
    if (!property) throw new NotFoundException("Imóvel não encontrado.");
    if (property.status === "arquivado") {
      throw new BadRequestException("Imóvel arquivado não pode entrar numa seleção.");
    }
    if (selection.items.some((i) => i.propertyId === property.id)) {
      throw new ConflictException("Este imóvel já está na seleção.");
    }

    // A compatibilidade é uma fotografia do momento da inclusão: se as
    // preferências mudarem depois, o selo do item continua contando a
    // história de por que o corretor o escolheu.
    const pref = await this.prisma.leadPreference.findFirst({
      where: { leadId: selection.leadId, brokerId },
    });
    const veredito = avaliarCompatibilidade(pref, property);

    const nextPosition = selection.items.reduce((max, i) => Math.max(max, i.position), -1) + 1;
    await this.prisma.selectionItem.create({
      data: {
        brokerId,
        selectionId: selection.id,
        propertyId: property.id,
        position: nextPosition,
        origin: dto.origin ?? "manual",
        compatibility: veredito?.level ?? null,
      },
    });
    return this.get(brokerId, id);
  }

  async updateItem(
    brokerId: string,
    id: string,
    itemId: string,
    dto: UpdateSelectionItemDto,
  ): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertEditableItems(selection.status);

    const item = selection.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Imóvel da seleção não encontrado.");

    if (dto.highlight === true && !item.highlight) {
      const destacados = selection.items.filter((i) => i.highlight).length;
      if (destacados >= SELECTION_MAX_HIGHLIGHTS) {
        throw new BadRequestException(
          `Uma seleção pode ter no máximo ${SELECTION_MAX_HIGHLIGHTS} imóveis em destaque.`,
        );
      }
    }

    await this.prisma.selectionItem.update({
      where: { id: item.id },
      data: {
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.highlight !== undefined ? { highlight: dto.highlight } : {}),
        ...(dto.brokerNote !== undefined ? { brokerNote: dto.brokerNote ?? null } : {}),
      },
    });
    return this.get(brokerId, id);
  }

  /** Reordena todos os itens numa tacada: a ordem do array é a ordem final. */
  async reorderItems(brokerId: string, id: string, dto: ReorderSelectionItemsDto): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertEditableItems(selection.status);

    const atuais = new Set(selection.items.map((i) => i.id));
    if (dto.itemIds.length !== atuais.size || dto.itemIds.some((i) => !atuais.has(i))) {
      throw new BadRequestException("A nova ordem precisa conter exatamente os itens da seleção.");
    }

    await this.prisma.$transaction(
      dto.itemIds.map((itemId, position) =>
        this.prisma.selectionItem.update({ where: { id: itemId }, data: { position } }),
      ),
    );
    return this.get(brokerId, id);
  }

  async removeItem(brokerId: string, id: string, itemId: string): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertEditableItems(selection.status);

    const item = selection.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Imóvel da seleção não encontrado.");

    await this.prisma.selectionItem.delete({ where: { id: item.id } });
    return this.get(brokerId, id);
  }

  // -------------------------------------------------------------------------
  // Transições
  // -------------------------------------------------------------------------

  /**
   * Ativa o rascunho: valida a composição, calcula a expiração no servidor a
   * partir do prazo escolhido e registra o marco na timeline da lead.
   */
  async activate(brokerId: string, id: string): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertTransition(selection.status, "ativa");

    if (selection.items.length === 0) {
      throw new BadRequestException("Adicione ao menos um imóvel antes de ativar a seleção.");
    }
    const dias = selection.expiresInDays as SelectionExpiryDays | null;
    if (!dias || !SELECTION_EXPIRY_OPTIONS.includes(dias)) {
      throw new BadRequestException("Defina o prazo de acesso (7, 15 ou 30 dias) antes de ativar.");
    }
    const arquivados = selection.items.filter((i) => i.property.status === "arquivado");
    if (arquivados.length > 0) {
      throw new BadRequestException("Remova os imóveis arquivados antes de ativar a seleção.");
    }

    const agora = new Date();
    const expiresAt = new Date(agora.getTime() + dias * 86_400_000);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.propertySelection.update({
        where: { id: selection.id },
        data: { status: "ativa", activatedAt: agora, sentAt: agora, expiresAt },
        include: INCLUDE_FULL,
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: selection.leadId,
          type: "selecao",
          description: `Seleção de ${selection.items.length} ${selection.items.length === 1 ? "imóvel ativada" : "imóveis ativada"}`,
          metadata: { selectionId: selection.id, action: "ativada", expiresInDays: dias },
        },
      });
      await this.trackSelection(brokerId, "SELECTION_ACTIVATED", selection.id, tx);
      // Ativar é gerar o link para enviar: neste produto os dois marcos andam
      // juntos (o envio em si acontece no WhatsApp, fora do nosso alcance).
      await this.trackSelection(brokerId, "SELECTION_SENT", selection.id, tx);
      return result;
    });
    return this.toView(updated);
  }

  /** Revoga o acesso imediatamente. O histórico permanece. */
  async revoke(brokerId: string, id: string): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertTransition(selection.status, "revogada");
    return this.close(brokerId, selection, "revogada", "Seleção revogada pelo corretor");
  }

  /** Arquiva: tira da vista sem apagar nada. Único destino de todo estado. */
  async archive(brokerId: string, id: string): Promise<SelectionView> {
    const selection = await this.expireIfDue(await this.owned(brokerId, id));
    this.assertTransition(selection.status, "arquivada");
    return this.close(brokerId, selection, "arquivada", "Seleção arquivada");
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private async close(
    brokerId: string,
    selection: SelectionRecord,
    status: "revogada" | "arquivada",
    descricao: string,
  ): Promise<SelectionView> {
    const agora = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.propertySelection.update({
        where: { id: selection.id },
        data: status === "revogada" ? { status, revokedAt: agora } : { status, archivedAt: agora },
        include: INCLUDE_FULL,
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: selection.leadId,
          type: "selecao",
          description: descricao,
          metadata: { selectionId: selection.id, action: status },
        },
      });
      if (status === "revogada") {
        await this.trackSelection(brokerId, "SELECTION_REVOKED", selection.id, tx);
      }
      return result;
    });
    return this.toView(updated);
  }

  private assertTransition(from: SelectionStatus, to: SelectionStatus): void {
    if (!TRANSITIONS[from].includes(to)) {
      throw new ConflictException(`Uma seleção ${this.statusLabel(from)} não pode ser ${this.statusLabel(to)}.`);
    }
  }

  /** Itens mudam no rascunho e na ativa (substituição de indisponível). */
  private assertEditableItems(status: SelectionStatus): void {
    if (status !== "rascunho" && status !== "ativa") {
      throw new ConflictException("Esta seleção está encerrada e não pode ser alterada.");
    }
  }

  /** Ativa com prazo vencido vira expirada na hora, persistida no banco. */
  private async expireIfDue(selection: SelectionRecord): Promise<SelectionRecord> {
    if (
      selection.status !== "ativa" ||
      !selection.expiresAt ||
      selection.expiresAt.getTime() >= Date.now()
    ) {
      return selection;
    }
    const expirada = await this.prisma.propertySelection.update({
      where: { id: selection.id },
      data: { status: "expirada" },
      include: INCLUDE_FULL,
    });
    await this.trackSelection(selection.brokerId, "SELECTION_EXPIRED", selection.id);
    return expirada;
  }

  private async owned(brokerId: string, id: string): Promise<SelectionRecord> {
    const selection = await this.prisma.propertySelection.findFirst({
      where: { id, brokerId },
      include: INCLUDE_FULL,
    });
    if (!selection) throw new NotFoundException("Seleção não encontrada.");
    return selection;
  }

  private statusLabel(status: SelectionStatus): string {
    const map: Record<SelectionStatus, string> = {
      rascunho: "em rascunho",
      ativa: "ativa",
      expirada: "expirada",
      revogada: "revogada",
      arquivada: "arquivada",
    };
    return map[status];
  }

  private toView(s: SelectionRecord): SelectionView {
    return {
      id: s.id,
      code: s.code,
      leadId: s.leadId,
      leadCode: s.lead.code,
      leadName: s.lead.fullName,
      status: s.status,
      publicToken: s.publicToken,
      message: s.message,
      expiresInDays: (s.expiresInDays as SelectionExpiryDays | null) ?? null,
      activatedAt: s.activatedAt?.toISOString() ?? null,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      revokedAt: s.revokedAt?.toISOString() ?? null,
      archivedAt: s.archivedAt?.toISOString() ?? null,
      sentAt: s.sentAt?.toISOString() ?? null,
      viewedAt: s.viewedAt?.toISOString() ?? null,
      lastAccessAt: s.lastAccessAt?.toISOString() ?? null,
      viewCount: s.viewCount,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      items: s.items
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((i) => this.toItemView(i)),
    };
  }

  private toItemView(i: SelectionRecord["items"][number]): SelectionItemView {
    const p = i.property;
    const price = p.salePrice != null ? Number(p.salePrice) : p.rentPrice != null ? Number(p.rentPrice) : null;
    const cover = p.media.find((m) => m.isCover && m.kind === "foto" && m.status === "pronto");
    return {
      id: i.id,
      propertyId: p.id,
      propertyCode: p.code,
      propertyTitle: p.title,
      propertyType: p.type,
      propertyStatus: p.status,
      city: p.city,
      neighborhood: p.neighborhood,
      coverUrl: cover ? `/api/properties/${p.id}/media/${cover.id}/file` : null,
      price,
      priceLabel: this.priceLabel(p.purpose, price),
      position: i.position,
      highlight: i.highlight,
      brokerNote: i.brokerNote,
      origin: i.origin,
      compatibility: i.compatibility,
      response: i.response,
      responseReason: i.responseReason,
      respondedAt: i.respondedAt?.toISOString() ?? null,
      visitRequestedAt: i.visitRequestedAt?.toISOString() ?? null,
    };
  }

  private priceLabel(purpose: string, price: number | null): string {
    if (price == null) return "Valor sob consulta";
    const formatted = price.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
    if (purpose === "locacao" || purpose === "temporada") return `${formatted} / mês`;
    return formatted;
  }
}
