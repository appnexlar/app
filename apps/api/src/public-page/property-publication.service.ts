import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Property, type PropertyMedia } from "@prisma/client";
import {
  MAX_HIGHLIGHTS,
  type ManagedPropertiesResponse,
  type ManagedProperty,
  type PropertyIneligibilityReason,
  type PropertyPublicVisibility,
  type PropertyPublicationEligibility,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";

/** O imóvel com as fotos junto: elegibilidade depende das duas coisas. */
type PropertyComMidia = Property & { media: PropertyMedia[] };

/** O que precisa vir do banco para julgar e listar. Um include só, reusado. */
const INCLUDE_MIDIA = {
  media: {
    where: { kind: "foto" as const, status: "pronto" as const },
    orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }],
  },
};

@Injectable()
export class PropertyPublicationService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Elegibilidade: a regra única (§11)
  // -------------------------------------------------------------------------

  /**
   * Decide se um imóvel pode ir para a vitrine, e explica o porquê quando não
   * pode. Esta é a ÚNICA fonte da verdade: publicação, listagem pública e o
   * requisito da página passam por aqui, então não existe imóvel elegível numa
   * tela e inelegível na outra.
   *
   * Preço não entra: "Valor sob consulta" é uma resposta legítima na vitrine.
   * Finalidade e categoria também não: são obrigatórias no cadastro, então
   * nunca faltam.
   */
  eligibility(property: PropertyComMidia): PropertyPublicationEligibility {
    const reasons: PropertyIneligibilityReason[] = [];
    const editar = `/imoveis/${property.id}/editar`;

    switch (property.status) {
      case "disponivel":
        break;
      case "rascunho":
        reasons.push({
          code: "rascunho",
          message: "O cadastro ainda é um rascunho. Conclua e marque como disponível.",
          actionUrl: editar,
        });
        break;
      case "arquivado":
        reasons.push({
          code: "arquivado",
          message: "Imóvel arquivado não vai para a vitrine.",
          actionUrl: `/imoveis/${property.id}`,
        });
        break;
      case "vendido":
        reasons.push({ code: "vendido", message: "Imóvel vendido sai da vitrine." });
        break;
      case "alugado":
        reasons.push({ code: "alugado", message: "Imóvel alugado sai da vitrine." });
        break;
      default:
        // reservado, em_negociacao, temporariamente_indisponivel
        reasons.push({
          code: "indisponivel",
          message: "O imóvel não está disponível agora. Só imóveis disponíveis ficam públicos.",
          actionUrl: `/imoveis/${property.id}`,
        });
    }

    // Uma vitrine sem foto não vende. A autorização de divulgação é do anúncio
    // inteiro, declarada quando o corretor põe o imóvel na página, não foto a
    // foto: o que está no anúncio é o que aparece.
    if (property.media.length === 0) {
      reasons.push({
        code: "sem_foto",
        message: "Adicione ao menos uma foto do imóvel.",
        actionUrl: `/imoveis/${property.id}/editar`,
      });
    }

    // Cidade é o mínimo: é por ela que o visitante se localiza e filtra.
    if (!property.city?.trim()) {
      reasons.push({
        code: "sem_localizacao",
        message: "Informe ao menos a cidade do imóvel.",
        actionUrl: editar,
      });
    }

    if (!property.type?.trim()) {
      reasons.push({
        code: "sem_tipo",
        message: "Informe o tipo do imóvel.",
        actionUrl: editar,
      });
    }

    return { eligible: reasons.length === 0, reasons };
  }

  /** Quantos imóveis públicos e elegíveis o corretor tem no ar agora. */
  async countPublishable(brokerId: string): Promise<number> {
    const candidatos = await this.prisma.property.findMany({
      where: { brokerId, publicVisibility: "publico" },
      include: INCLUDE_MIDIA,
    });
    return candidatos.filter((p) => this.eligibility(p).eligible).length;
  }

  // -------------------------------------------------------------------------
  // Gerenciador
  // -------------------------------------------------------------------------

  /**
   * Carteira inteira do corretor com o veredito de cada imóvel. A tela filtra
   * e busca sobre isto; a carteira de um corretor cabe numa resposta, e
   * paginar aqui esconderia justamente o que o gerenciador precisa contar.
   */
  async listForManager(brokerId: string): Promise<ManagedPropertiesResponse> {
    const properties = await this.prisma.property.findMany({
      where: { brokerId, status: { not: "arquivado" } },
      include: INCLUDE_MIDIA,
      orderBy: [{ highlightOrder: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    });

    const items = properties.map((p) => this.toManaged(p));

    return {
      items,
      summary: {
        publicados: items.filter((i) => i.visibility === "publico" && i.eligibility.eligible).length,
        prontos: items.filter((i) => i.visibility !== "publico" && i.eligibility.eligible).length,
        comPendencia: items.filter((i) => !i.eligibility.eligible).length,
        destaques: items.filter((i) => i.highlightOrder != null).length,
        maxDestaques: MAX_HIGHLIGHTS,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Visibilidade
  // -------------------------------------------------------------------------

  /**
   * Põe no ar, de uma vez, todos os imóveis elegíveis que estão fora dela.
   * Existe por causa da virada de padrão: quem cadastrou antes tem a carteira
   * privada e não vai abrir imóvel por imóvel. Só toca no que passa na
   * elegibilidade, e devolve quantos entraram.
   */
  async publishAllEligible(brokerId: string): Promise<{ publicados: number }> {
    const candidatos = await this.prisma.property.findMany({
      where: {
        brokerId,
        publicVisibility: { not: "publico" },
        status: { not: "arquivado" },
      },
      include: INCLUDE_MIDIA,
    });
    const elegiveis = candidatos.filter((p) => this.eligibility(p).eligible);
    if (elegiveis.length === 0) return { publicados: 0 };

    const agora = new Date();
    await this.prisma.$transaction(
      elegiveis.map((p) =>
        this.prisma.property.update({
          where: { id: p.id },
          data: { publicVisibility: "publico", publicSince: p.publicSince ?? agora },
        }),
      ),
    );

    // Auditoria por imóvel: a trilha precisa dizer qual anúncio foi para o ar,
    // não só quantos.
    await this.prisma.auditLog.createMany({
      data: elegiveis.map((p) => ({
        brokerId,
        action: "imovel_publicado_em_lote",
        entityType: "property",
        entityId: p.id,
      })),
    });

    return { publicados: elegiveis.length };
  }

  /**
   * Muda a exposição de um imóvel. Publicar exige elegibilidade; tirar do ar
   * nunca é bloqueado (o corretor precisa poder recolher a qualquer momento).
   */
  async changeVisibility(
    brokerId: string,
    propertyId: string,
    visibility: PropertyPublicVisibility,
  ): Promise<ManagedProperty> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, brokerId },
      include: INCLUDE_MIDIA,
    });
    if (!property) throw new NotFoundException("Imóvel não encontrado.");

    if (visibility === "publico") {
      const veredito = this.eligibility(property);
      if (!veredito.eligible) {
        throw new BadRequestException({
          message: "Este imóvel ainda não pode ir para a sua página.",
          details: { reasons: veredito.reasons },
        });
      }
    }

    const atualizado = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        publicVisibility: visibility,
        publicSince: visibility === "publico" ? (property.publicSince ?? new Date()) : property.publicSince,
        // Sair do ar tira o destaque junto: destaque de imóvel invisível é um
        // buraco no bloco de destaques da vitrine.
        highlightOrder: visibility === "publico" ? property.highlightOrder : null,
      },
      include: INCLUDE_MIDIA,
    });

    await this.audit(brokerId, propertyId, "imovel_visibilidade_alterada", {
      de: property.publicVisibility,
      para: visibility,
    });

    return this.toManaged(atualizado);
  }

  // -------------------------------------------------------------------------
  // Destaques
  // -------------------------------------------------------------------------

  /**
   * Define os destaques de uma vez, na ordem recebida. Lista inteira em vez de
   * item a item: assim não existe estado meio-arrumado se algo falhar no meio.
   */
  async setHighlights(brokerId: string, propertyIds: string[]): Promise<ManagedPropertiesResponse> {
    if (propertyIds.length > MAX_HIGHLIGHTS) {
      throw new BadRequestException(`Você pode destacar até ${MAX_HIGHLIGHTS} imóveis.`);
    }
    if (new Set(propertyIds).size !== propertyIds.length) {
      throw new BadRequestException("Há imóveis repetidos na lista de destaques.");
    }

    if (propertyIds.length > 0) {
      const escolhidos = await this.prisma.property.findMany({
        where: { id: { in: propertyIds }, brokerId },
        include: INCLUDE_MIDIA,
      });
      if (escolhidos.length !== propertyIds.length) {
        throw new NotFoundException("Algum imóvel da lista não foi encontrado.");
      }
      const invalido = escolhidos.find(
        (p) => p.publicVisibility !== "publico" || !this.eligibility(p).eligible,
      );
      if (invalido) {
        throw new BadRequestException(
          `"${invalido.title}" precisa estar publicado para virar destaque.`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.property.updateMany({
        where: { brokerId, highlightOrder: { not: null } },
        data: { highlightOrder: null },
      }),
      ...propertyIds.map((id, i) =>
        this.prisma.property.update({ where: { id }, data: { highlightOrder: i + 1 } }),
      ),
    ]);

    await this.audit(brokerId, brokerId, "destaques_alterados", { total: propertyIds.length });

    return this.listForManager(brokerId);
  }

  /**
   * Faxina dos destaques: tira o que deixou de ser publicável e fecha os
   * buracos na numeração. Chamado quando a página é lida, porque um imóvel
   * pode ter sido vendido por outro caminho (status, mídia) sem passar por
   * aqui, e destaque quebrado é vitrine quebrada.
   */
  async reconcileHighlights(brokerId: string): Promise<void> {
    const destaques = await this.prisma.property.findMany({
      where: { brokerId, highlightOrder: { not: null } },
      include: INCLUDE_MIDIA,
      orderBy: { highlightOrder: "asc" },
    });

    const validos = destaques.filter(
      (p) => p.publicVisibility === "publico" && this.eligibility(p).eligible,
    );
    const perdidos = destaques.filter((p) => !validos.includes(p));
    const desordenados = validos.some((p, i) => p.highlightOrder !== i + 1);
    if (perdidos.length === 0 && !desordenados) return;

    await this.prisma.$transaction([
      ...perdidos.map((p) =>
        this.prisma.property.update({ where: { id: p.id }, data: { highlightOrder: null } }),
      ),
      ...validos.map((p, i) =>
        this.prisma.property.update({ where: { id: p.id }, data: { highlightOrder: i + 1 } }),
      ),
    ]);
  }

  // -------------------------------------------------------------------------
  // Infra
  // -------------------------------------------------------------------------

  private toManaged(p: PropertyComMidia): ManagedProperty {
    // A ordem já vem com a capa primeiro (isCover desc, sortOrder asc).
    const capa = p.media[0] ?? null;
    const preco = p.salePrice != null ? Number(p.salePrice) : p.rentPrice != null ? Number(p.rentPrice) : null;

    return {
      id: p.id,
      code: p.code,
      title: p.title,
      purpose: p.purpose,
      type: p.type,
      status: p.status,
      city: p.city,
      neighborhood: p.neighborhood,
      priceLabel: precoLegivel(p.purpose, preco),
      coverUrl: capa ? `/api/properties/${p.id}/media/${capa.id}/file` : null,
      visibility: p.publicVisibility,
      highlightOrder: p.highlightOrder,
      eligibility: this.eligibility(p),
    };
  }

  private async audit(
    brokerId: string,
    entityId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        brokerId,
        action,
        entityType: "property",
        entityId,
        metadata: metadata as Prisma.InputJsonObject,
      },
    });
  }
}

/** Mesma régua de preço da página pública do imóvel compartilhado. */
function precoLegivel(purpose: string, price: number | null): string {
  if (price == null) return "Valor sob consulta";
  const valor = price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  return purpose === "locacao" || purpose === "temporada" ? `${valor} / mês` : valor;
}
