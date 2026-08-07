import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CreateShareDto,
  LeadShareSummary,
  PropertyShareSummary,
  PublicSharedProperty,
  SelectionResponse,
  SetPriorityDto,
  SetResponseDto,
} from "@nexlar/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { promoteLeadStage } from "./lead-stage";
import { ProductEventService } from "../guidance/product-event.service";

type SelectionWithRelations = Prisma.PropertySelectionGetPayload<{
  include: { lead: true; items: { include: { property: true } } };
}>;

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly events: ProductEventService,
  ) {}

  /** Ver lead-stage.ts: regra única de avanço automático do funil. */
  private promoteLeadStage = promoteLeadStage;

  /** Cria o compartilhamento (seleção com um item) do imóvel para a lead. */
  async createShare(
    brokerId: string,
    propertyId: string,
    dto: CreateShareDto,
  ): Promise<PropertyShareSummary> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, brokerId },
      select: { id: true, title: true },
    });
    if (!property) throw new NotFoundException("Imóvel não encontrado.");

    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, brokerId },
      select: { id: true, fullName: true, whatsapp: true },
    });
    if (!lead) throw new NotFoundException("Lead não encontrada.");

    const selection = await this.prisma.$transaction(async (tx) => {
      // O envio rápido nasce direto ativo: criar, ativar e enviar são o
      // mesmo gesto quando a seleção tem um imóvel só.
      const created = await tx.propertySelection.create({
        data: {
          brokerId,
          leadId: lead.id,
          publicToken: this.newToken(),
          status: "ativa",
          message: dto.message,
          sentAt: new Date(),
          activatedAt: new Date(),
          items: {
            create: { brokerId, propertyId, position: 0 },
          },
        },
        include: { lead: true, items: { include: { property: true } } },
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: lead.id,
          type: "selecao",
          description: `Imóvel enviado: ${property.title}`,
          metadata: { propertyId, selectionId: created.id },
        },
      });
      // Enviar imóvel move a lead para "Imóveis enviados" no funil.
      await this.promoteLeadStage(tx, brokerId, lead.id, "imoveis_enviados");
      // Neste produto, uma ação só relaciona imóvel a lead (match), gera o
      // link exclusivo e já o envia. Os três marcos coincidem; cada um
      // deduplica pelo próprio tipo, então só a primeira vez conta.
      await this.events.track(
        brokerId,
        { type: "FIRST_PROPERTY_MATCH_CREATED", source: "ui", entityType: "selection", entityId: created.id },
        tx,
      );
      await this.events.track(
        brokerId,
        { type: "FIRST_PERSONALIZED_LINK_GENERATED", source: "ui", entityType: "selection", entityId: created.id },
        tx,
      );
      await this.events.track(
        brokerId,
        { type: "FIRST_LINK_SENT", source: "ui", entityType: "selection", entityId: created.id },
        tx,
      );
      return created;
    });

    return this.toShareSummary(selection);
  }

  /** Leads que receberam este imóvel. */
  async listForProperty(brokerId: string, propertyId: string): Promise<PropertyShareSummary[]> {
    const selections = await this.prisma.propertySelection.findMany({
      where: { brokerId, items: { some: { propertyId } } },
      include: { lead: true, items: { include: { property: true } } },
      orderBy: { createdAt: "desc" },
    });
    return selections.map((s) => this.toShareSummary(s, propertyId));
  }

  /** Imóveis enviados para esta lead (alimenta a seção da ficha). */
  async listForLead(brokerId: string, leadId: string): Promise<LeadShareSummary[]> {
    const selections = await this.prisma.propertySelection.findMany({
      where: { brokerId, leadId },
      include: { items: { include: { property: { include: { media: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return selections.flatMap((s) =>
      s.items.map((item) => {
        const p = item.property;
        const price =
          p.salePrice != null ? Number(p.salePrice) : p.rentPrice != null ? Number(p.rentPrice) : null;
        const cover = p.media.find((m) => m.isCover && m.kind === "foto" && m.status === "pronto");
        return {
          id: s.id,
          publicToken: s.publicToken,
          propertyId: p.id,
          propertyCode: p.code,
          propertyTitle: p.title,
          propertyType: p.type,
          city: p.city,
          neighborhood: p.neighborhood,
          coverUrl: cover ? `/api/properties/${p.id}/media/${cover.id}/file` : null,
          price,
          priceLabel: this.priceLabel(p.purpose, price),
          status: this.unavailableReason(s) === "expirado" ? "expirada" : s.status,
          response: item.response,
          respondedAt: item.respondedAt?.toISOString() ?? null,
          isPriority: item.isPriority,
          visitRequestedAt: item.visitRequestedAt?.toISOString() ?? null,
          viewCount: s.viewCount,
          message: s.message,
          createdAt: s.createdAt.toISOString(),
          sentAt: s.sentAt?.toISOString() ?? null,
          propertyStatus: p.status,
        };
      }),
    );
  }

  /** Registra manualmente a resposta da lead sobre um imóvel enviado. */
  async setResponse(brokerId: string, shareId: string, dto: SetResponseDto): Promise<void> {
    const selection = await this.prisma.propertySelection.findFirst({
      where: { id: shareId, brokerId },
      include: { items: true },
    });
    if (!selection) throw new NotFoundException("Compartilhamento não encontrado.");
    const item = selection.items[0];
    if (!item) throw new NotFoundException("Imóvel do compartilhamento não encontrado.");

    await this.prisma.$transaction(async (tx) => {
      await tx.selectionItem.update({
        where: { id: item.id },
        data: {
          response: dto.response,
          respondedAt: new Date(),
          visitRequestedAt: dto.response === "quero_visitar" ? new Date() : item.visitRequestedAt,
        },
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId: selection.leadId,
          type: "selecao",
          description: `Resposta registrada: ${this.responseLabel(dto.response)}`,
          metadata: { propertyId: item.propertyId, selectionId: shareId, response: dto.response },
        },
      });
      // Resposta move o funil: pedir visita vai direto para "Visita
      // solicitada"; qualquer outra resposta indica que está avaliando.
      await this.promoteLeadStage(
        tx,
        brokerId,
        selection.leadId,
        dto.response === "quero_visitar" ? "visita_solicitada" : "avaliando_imoveis",
      );
      // Manifestação de interesse da lead: quer visitar ou gostou do imóvel.
      if (dto.response === "quero_visitar" || dto.response === "tenho_interesse") {
        await this.events.track(
          brokerId,
          { type: "FIRST_INTEREST_RECEIVED", source: "api", entityType: "selection", entityId: shareId },
          tx,
        );
      }
    });
  }

  /** Marca (ou desmarca) um imóvel como prioritário para a lead. Só um por vez. */
  async setPriority(brokerId: string, shareId: string, dto: SetPriorityDto): Promise<void> {
    const selection = await this.prisma.propertySelection.findFirst({
      where: { id: shareId, brokerId },
      include: { items: { include: { property: { select: { title: true } } } } },
    });
    if (!selection) throw new NotFoundException("Compartilhamento não encontrado.");
    const item = selection.items[0];
    if (!item) throw new NotFoundException("Imóvel do compartilhamento não encontrado.");

    await this.prisma.$transaction(async (tx) => {
      if (dto.isPriority) {
        // Só um prioritário por lead: zera os demais itens das seleções dela.
        await tx.selectionItem.updateMany({
          where: { brokerId, selection: { leadId: selection.leadId }, isPriority: true },
          data: { isPriority: false },
        });
      }
      await tx.selectionItem.update({ where: { id: item.id }, data: { isPriority: dto.isPriority } });
      if (dto.isPriority) {
        await tx.leadActivity.create({
          data: {
            brokerId,
            leadId: selection.leadId,
            type: "selecao",
            description: `Imóvel prioritário: ${item.property.title}`,
            metadata: { propertyId: item.propertyId, selectionId: shareId },
          },
        });
        // Ter um imóvel prioritário move a lead para essa etapa do funil.
        await this.promoteLeadStage(tx, brokerId, selection.leadId, "imovel_prioritario");
      }
    });
  }

  private responseLabel(response: SelectionResponse): string {
    const map: Record<SelectionResponse, string> = {
      nao_visualizado: "Não visualizado",
      visualizado: "Visualizado",
      tenho_interesse: "Tenho interesse",
      talvez: "Talvez",
      sem_interesse: "Não tenho interesse",
      quero_visitar: "Quero visitar",
    };
    return map[response];
  }

  /**
   * Reenviar: não duplica, só atualiza a data e conta o reenvio. É a regra
   * explícita de reabertura do envio rápido: reenviar um link revogado o
   * reativa (decisão consciente do corretor, registrada pelo resendCount).
   */
  async resend(brokerId: string, shareId: string): Promise<PropertyShareSummary> {
    await this.getOwnedSelection(brokerId, shareId);
    const updated = await this.prisma.propertySelection.update({
      where: { id: shareId },
      data: { sentAt: new Date(), resendCount: { increment: 1 }, status: "ativa", revokedAt: null },
      include: { lead: true, items: { include: { property: true } } },
    });
    return this.toShareSummary(updated);
  }

  /** Revogar o link: mantém o histórico, derruba o acesso público. */
  async revoke(brokerId: string, shareId: string): Promise<PropertyShareSummary> {
    await this.getOwnedSelection(brokerId, shareId);
    const updated = await this.prisma.propertySelection.update({
      where: { id: shareId },
      data: { revokedAt: new Date(), status: "revogada" },
      include: { lead: true, items: { include: { property: true } } },
    });
    return this.toShareSummary(updated);
  }

  /** Página pública por token. Registra o acesso. Sem login. */
  async getPublic(token: string): Promise<PublicSharedProperty> {
    const selection = await this.prisma.propertySelection.findUnique({
      where: { publicToken: token },
      include: {
        lead: true,
        broker: true,
        items: { include: { property: { include: { media: true } } }, orderBy: { position: "asc" } },
      },
    });
    if (!selection) throw new NotFoundException("Compartilhamento não encontrado.");

    const reason = this.unavailableReason(selection);
    if (reason) {
      return { available: false, unavailableReason: reason, propertyTitle: null, property: null, broker: null };
    }

    const item = selection.items[0];
    const property = item.property;

    // Imóvel vendido/alugado/indisponível: a lead vê o motivo e o contato do
    // corretor (para pedir opções parecidas), mas não os dados do imóvel.
    const propertyReason = this.propertyUnavailableReason(property.status);
    if (propertyReason) {
      // Conta o acesso mesmo assim: o corretor sabe que a lead abriu o link.
      await this.prisma.propertySelection.update({
        where: { id: selection.id },
        data: {
          viewCount: { increment: 1 },
          lastAccessAt: new Date(),
          viewedAt: selection.viewedAt ?? new Date(),
        },
      });
      return {
        available: false,
        unavailableReason: propertyReason,
        propertyTitle: property.title,
        property: null,
        broker: brokerPublico(selection.broker),
      };
    }

    // Registra a visualização. Abrir o link não muda o estado da seleção:
    // "visualizada" vive em viewedAt/viewCount.
    await this.prisma.propertySelection.update({
      where: { id: selection.id },
      data: {
        viewCount: { increment: 1 },
        lastAccessAt: new Date(),
        viewedAt: selection.viewedAt ?? new Date(),
      },
    });
    await this.prisma.selectionItem.updateMany({
      where: { selectionId: selection.id, response: "nao_visualizado" },
      data: { response: "visualizado", respondedAt: new Date() },
    });
    // A lead abriu o link: no funil ela está avaliando os imóveis.
    await this.promoteLeadStage(this.prisma, selection.brokerId, selection.leadId, "avaliando_imoveis");
    const purpose = property.purpose;
    const price =
      property.salePrice != null
        ? Number(property.salePrice)
        : property.rentPrice != null
          ? Number(property.rentPrice)
          : null;

    const photos = property.media
      .filter((m) => m.kind === "foto" && m.authorized && m.status === "pronto")
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder)
      .map((m) => ({
        url: m.externalUrl ?? `/api/public/shares/${token}/media/${m.id}`,
        caption: m.caption,
      }));

    return {
      available: true,
      unavailableReason: null,
      propertyTitle: property.title,
      property: {
        title: property.title,
        purpose,
        type: property.type,
        price,
        priceLabel: this.priceLabel(purpose, price),
        locationLine: this.locationLine(property),
        addressDisplay: property.addressDisplay,
        description: property.description,
        features: property.features,
        photos,
      },
      broker: brokerPublico(selection.broker),
    };
  }

  /** Serve a imagem autorizada do imóvel compartilhado, validando pelo token. */
  async streamPublicMedia(token: string, mediaId: string) {
    const selection = await this.prisma.propertySelection.findUnique({
      where: { publicToken: token },
      include: { items: { include: { property: { select: { status: true } } } } },
    });
    if (
      !selection ||
      this.unavailableReason(selection) ||
      selection.items.some((i) => this.propertyUnavailableReason(i.property.status))
    ) {
      throw new NotFoundException("Compartilhamento não disponível.");
    }
    const propertyIds = selection.items.map((i) => i.propertyId);
    const media = await this.prisma.propertyMedia.findFirst({
      where: {
        id: mediaId,
        propertyId: { in: propertyIds },
        authorized: true,
        status: "pronto",
        kind: "foto",
      },
    });
    if (!media?.storagePath) throw new NotFoundException("Imagem não disponível.");
    return {
      stream: await this.storage.getStream(media.storagePath),
      mimeType: media.mimeType ?? "application/octet-stream",
    };
  }

  private newToken(): string {
    return randomBytes(24).toString("base64url");
  }

  private unavailableReason(s: {
    status?: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  }): "revogado" | "expirado" | null {
    if (s.revokedAt || s.status === "revogada") return "revogado";
    if (s.expiresAt && s.expiresAt.getTime() < Date.now()) return "expirado";
    if (s.status === "expirada") return "expirado";
    // Rascunho e arquivada não circulam: para quem tem o link, é como se o
    // acesso tivesse sido encerrado. O motivo interno nunca vaza.
    if (s.status === "rascunho" || s.status === "arquivada") return "revogado";
    return null;
  }

  /**
   * O status do imóvel também derruba a página pública: vendido/alugado
   * mostram o motivo real; os demais estados fora de "disponível em oferta"
   * viram "indisponivel" genérico.
   */
  private propertyUnavailableReason(status: string): "vendido" | "alugado" | "indisponivel" | null {
    if (status === "vendido") return "vendido";
    if (status === "alugado") return "alugado";
    if (status === "arquivado" || status === "temporariamente_indisponivel" || status === "rascunho") {
      return "indisponivel";
    }
    // disponivel, reservado e em_negociacao continuam visíveis para a lead.
    return null;
  }

  private async getOwnedSelection(brokerId: string, shareId: string) {
    const selection = await this.prisma.propertySelection.findFirst({
      where: { id: shareId, brokerId },
      select: { id: true },
    });
    if (!selection) throw new NotFoundException("Compartilhamento não encontrado.");
    return selection;
  }

  private toShareSummary(s: SelectionWithRelations, propertyId?: string): PropertyShareSummary {
    const item = propertyId ? s.items.find((i) => i.propertyId === propertyId) ?? s.items[0] : s.items[0];
    return {
      id: s.id,
      leadId: s.leadId,
      leadName: s.lead.fullName,
      leadWhatsapp: s.lead.whatsapp,
      publicToken: s.publicToken,
      status: this.unavailableReason(s) === "expirado" ? "expirada" : s.status,
      response: item?.response ?? "nao_visualizado",
      message: s.message,
      viewCount: s.viewCount,
      resendCount: s.resendCount,
      createdAt: s.createdAt.toISOString(),
      sentAt: s.sentAt?.toISOString() ?? null,
      viewedAt: s.viewedAt?.toISOString() ?? null,
      lastAccessAt: s.lastAccessAt?.toISOString() ?? null,
      revokedAt: s.revokedAt?.toISOString() ?? null,
      expiresAt: s.expiresAt?.toISOString() ?? null,
    };
  }

  private priceLabel(purpose: string, price: number | null): string {
    if (price == null) return "Valor sob consulta";
    const formatted = price.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    if (purpose === "locacao" || purpose === "temporada") return `${formatted} / mês`;
    return formatted;
  }

  private locationLine(p: {
    addressDisplay: string;
    street: string | null;
    addressNumber: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  }): string | null {
    const cityState = [p.neighborhood, [p.city, p.state].filter(Boolean).join("/")].filter(Boolean).join(", ");
    if (p.addressDisplay === "completo") {
      const line = [[p.street, p.addressNumber].filter(Boolean).join(", "), cityState].filter(Boolean).join(" - ");
      return line || null;
    }
    if (p.addressDisplay === "sem_numero") {
      const line = [p.street, cityState].filter(Boolean).join(" - ");
      return line || null;
    }
    if (p.addressDisplay === "aproximado") {
      return cityState ? `${cityState} (aproximado)` : null;
    }
    return cityState || null;
  }

}

/**
 * O que a lead pode ver do corretor numa página aberta na internet: nome,
 * WhatsApp, imobiliária e o selo. Nunca e-mail nem identificador interno.
 *
 * O número do CRECI só sai quando está verificado. Mostrar um CRECI que
 * ninguém conferiu daria ao número uma autoridade que ele não tem.
 */
export function brokerPublico(broker: {
  fullName: string;
  phone: string | null;
  agencyName: string | null;
  creci: string | null;
  creciUf: string | null;
  creciStatus: string;
}) {
  const verificado = broker.creciStatus === "aprovado";
  return {
    name: broker.fullName,
    whatsapp: broker.phone,
    agencyName: broker.agencyName,
    verified: verificado,
    creci: verificado ? broker.creci : null,
    creciUf: verificado ? broker.creciUf : null,
  };
}
