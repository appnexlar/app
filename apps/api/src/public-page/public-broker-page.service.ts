import { Injectable, NotFoundException } from "@nestjs/common";
import type { Readable } from "node:stream";
import { extname } from "node:path";
import type { Broker, BrokerPublicPage, Property, PropertyMedia } from "@prisma/client";
import {
  PUBLIC_PAGE_SIZE,
  type PublicBrokerPageResponse,
  type PublicBrokerPageView,
  type PublicListingQuery,
  type PublicListingResponse,
  type PublicPropertyCard,
  type PublicPropertyDetailResponse,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PropertyPublicationService } from "./property-publication.service";
import {
  detalhes,
  montarDetalhePublico,
  normalizar,
  precoEfetivo,
  precoLegivel,
  soFotos,
} from "./property-public-view";

/**
 * Monta a vitrine que o visitante vê. Regras de ouro:
 * - só página `ativa` responde; qualquer outro estado é "indisponível", sem
 *   dizer o porquê (o motivo é assunto do corretor, não do visitante);
 * - só imóvel público E elegível entra, pela regra única da publicação;
 * - nenhum id interno sai: imóvel é referenciado pelo código público, foto
 *   pela rota pública validada por posse.
 */
@Injectable()
export class PublicBrokerPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly publication: PropertyPublicationService,
  ) {}

  /** Vitrine pelo slug (rota pública). */
  async getBySlug(slug: string): Promise<PublicBrokerPageResponse> {
    const page = await this.prisma.brokerPublicPage.findUnique({
      where: { slug },
      include: { broker: true },
    });
    if (!page || page.status !== "ativa") {
      return { available: false, page: null };
    }
    return { available: true, page: await this.buildView(page, page.broker) };
  }

  /**
   * Prévia para o dono, com os dados de agora e SEM exigir página ativa:
   * a prévia existe justamente para ver antes de publicar.
   */
  async preview(brokerId: string): Promise<PublicBrokerPageResponse> {
    const page = await this.prisma.brokerPublicPage.findUnique({
      where: { brokerId },
      include: { broker: true },
    });
    if (!page) return { available: false, page: null };
    return { available: true, page: await this.buildView(page, page.broker) };
  }

  // -------------------------------------------------------------------------
  // Listagem com busca, filtros e ordenação (§17-§20)
  // -------------------------------------------------------------------------

  /**
   * A vitrine filtrável. A carteira de um corretor é pequena (dezenas, não
   * milhares), então carregamos os publicáveis uma vez e filtramos em memória:
   * a elegibilidade é regra de código, não de SQL, e assim a listagem usa
   * EXATAMENTE o mesmo juiz do resto do sistema.
   */
  async listProperties(slug: string, query: PublicListingQuery): Promise<PublicListingResponse> {
    const vazio: PublicListingResponse = {
      available: false,
      items: [],
      total: 0,
      page: query.page,
      pageSize: PUBLIC_PAGE_SIZE,
      facets: { types: [], neighborhoods: [] },
    };

    const page = await this.prisma.brokerPublicPage.findUnique({ where: { slug } });
    if (!page || page.status !== "ativa") return vazio;

    const publicaveis = await this.loadPublishable(page.brokerId);

    // Facetas vêm do conjunto inteiro, não do filtrado: o visitante precisa
    // ver as opções que existem, não só as que sobraram.
    const facets = {
      types: [...new Set(publicaveis.map((p) => p.type).filter(Boolean))].sort(),
      neighborhoods: [...new Set(publicaveis.map((p) => p.neighborhood ?? "").filter(Boolean))].sort(),
    };

    const filtrados = publicaveis.filter((p) => {
      if (query.purpose && p.purpose !== query.purpose) return false;
      if (query.type && normalizar(p.type) !== normalizar(query.type)) return false;
      if (query.neighborhood && normalizar(p.neighborhood ?? "") !== normalizar(query.neighborhood)) {
        return false;
      }

      const preco = precoEfetivo(p);
      if (query.minPrice != null && (preco == null || preco < query.minPrice)) return false;
      if (query.maxPrice != null && (preco == null || preco > query.maxPrice)) return false;

      const d = detalhes(p);
      if (query.bedrooms != null && (d.bedrooms ?? 0) < query.bedrooms) return false;
      if (query.bathrooms != null && (d.bathrooms ?? 0) < query.bathrooms) return false;
      if (query.parking != null && (d.parkingSpots ?? 0) < query.parking) return false;
      if (query.minArea != null && (d.area ?? 0) < query.minArea) return false;

      if (query.q) {
        const termo = normalizar(query.q);
        const campos = [p.title, p.type, p.neighborhood, p.city, p.condoName, `#${p.code}`, String(p.code)]
          .filter(Boolean)
          .map((c) => normalizar(String(c)));
        if (!campos.some((c) => c.includes(termo))) return false;
      }
      return true;
    });

    ordenar(filtrados, query.sort);

    const inicio = (query.page - 1) * PUBLIC_PAGE_SIZE;
    const pagina = filtrados.slice(inicio, inicio + PUBLIC_PAGE_SIZE);

    return {
      available: true,
      items: pagina.map((p) => this.toCard(slug, p)),
      total: filtrados.length,
      page: query.page,
      pageSize: PUBLIC_PAGE_SIZE,
      facets,
    };
  }

  // -------------------------------------------------------------------------
  // Detalhe público (§22)
  // -------------------------------------------------------------------------

  async getPropertyDetail(slug: string, code: number): Promise<PublicPropertyDetailResponse> {
    const indisponivel: PublicPropertyDetailResponse = {
      available: false,
      property: null,
      broker: null,
    };

    const page = await this.prisma.brokerPublicPage.findUnique({
      where: { slug },
      include: { broker: true },
    });
    if (!page || page.status !== "ativa") return indisponivel;

    const property = await this.prisma.property.findFirst({
      where: { code, brokerId: page.brokerId, publicVisibility: "publico" },
      include: {
        // Anúncio publicado mostra o que o corretor cadastrou: fotos, vídeos e
        // links. A decisão de divulgar é do anúncio inteiro, tomada ao pôr o
        // imóvel na página.
        media: {
          where: { status: "pronto" },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        },
      },
    });
    // Vendido, oculto ou inexistente: tudo igual por fora. O que o visitante
    // precisa saber é que este anúncio não está mais de pé.
    // A elegibilidade pergunta por FOTO: vídeo e link não substituem foto, então
    // o veredito recebe só as fotos, mesmo que a página mostre o resto.
    if (!property || !this.publication.eligibility(soFotos(property)).eligible) {
      return indisponivel;
    }

    return {
      available: true,
      property: montarDetalhePublico(
        property,
        `/api/public/corretor/${slug}/imoveis/${property.code}/foto`,
      ),
      broker: {
        slug,
        name: page.professionalName ?? page.broker.fullName,
        photoUrl: page.broker.avatarKey
          ? `/api/public/corretor/${slug}/foto?v=${page.broker.updatedAt.getTime()}`
          : page.broker.avatarUrl,
        verified: page.broker.creciStatus === "aprovado",
        whatsapp: page.publicWhatsapp,
      },
    };
  }

  /** Publicáveis do corretor: públicos E elegíveis, com as fotos prontas. */
  private async loadPublishable(brokerId: string) {
    const properties = await this.prisma.property.findMany({
      where: { brokerId, publicVisibility: "publico" },
      include: {
        media: {
          where: { kind: "foto", status: "pronto" },
          orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }],
        },
      },
    });
    return properties.filter((p) => this.publication.eligibility(p).eligible);
  }

  // -------------------------------------------------------------------------
  // Fotos públicas
  // -------------------------------------------------------------------------

  /**
   * Foto de perfil do corretor da vitrine. A posse é validada pelo slug: só
   * sai a foto de quem tem página ATIVA com aquele endereço.
   */
  async streamAvatar(slug: string): Promise<{ stream: Readable; mimeType: string }> {
    const page = await this.prisma.brokerPublicPage.findUnique({
      where: { slug },
      include: { broker: true },
    });
    if (!page || page.status !== "ativa" || !page.broker.avatarKey) {
      throw new NotFoundException();
    }
    const stream = await this.storage.getStream(page.broker.avatarKey);
    return { stream, mimeType: mimeDaChave(page.broker.avatarKey) };
  }

  /**
   * Foto de um imóvel da vitrine, referenciada pelo CÓDIGO público. Só sai se
   * a página está ativa, o imóvel é daquele corretor, está publicado e
   * elegível, e a foto é autorizada. Cada elo da corrente é conferido.
   */
  async streamPropertyPhoto(
    slug: string,
    code: number,
    mediaId: string,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const page = await this.prisma.brokerPublicPage.findUnique({ where: { slug } });
    if (!page || page.status !== "ativa") throw new NotFoundException();

    const property = await this.prisma.property.findFirst({
      where: { code, brokerId: page.brokerId, publicVisibility: "publico" },
      include: {
        // Foto e vídeo saem pela mesma porta; link externo não é arquivo nosso.
        media: { where: { kind: { in: ["foto", "video"] }, status: "pronto" } },
      },
    });
    if (!property || !this.publication.eligibility(soFotos(property)).eligible) {
      throw new NotFoundException();
    }

    const media = property.media.find((m) => m.id === mediaId);
    if (!media?.storagePath) throw new NotFoundException();

    const stream = await this.storage.getStream(media.storagePath);
    return { stream, mimeType: media.mimeType ?? mimeDaChave(media.storagePath) };
  }

  // -------------------------------------------------------------------------
  // Montagem da view
  // -------------------------------------------------------------------------

  private async buildView(page: BrokerPublicPage, broker: Broker): Promise<PublicBrokerPageView> {
    const publicaveis = await this.loadPublishable(page.brokerId);
    // Destaques na ordem do corretor, depois os mais recentes.
    ordenar(publicaveis, "destaque");
    const slug = page.slug ?? "";
    const cards = publicaveis.map((p) => this.toCard(slug, p));

    const verificado = broker.creciStatus === "aprovado";

    return {
      slug,
      // A vitrine assina com o nome profissional; o civil fica de reserva.
      name: page.professionalName ?? broker.fullName,
      headline: page.headline,
      bio: page.bio,
      photoUrl: broker.avatarKey
        ? `/api/public/corretor/${slug}/foto?v=${broker.updatedAt.getTime()}`
        : broker.avatarUrl,
      verified: verificado,
      creci: verificado ? broker.creci : null,
      creciUf: verificado ? broker.creciUf : null,
      agencyName: broker.agencyName,
      agencyLogoUrl: page.agencyLogoUrl,
      mainCity: page.mainCity,
      regions: page.regions,
      focus: page.focus,
      propertyTypes: page.propertyTypes,
      languages: page.languages,
      whatsapp: page.publicWhatsapp,
      phone: page.publicPhone,
      email: page.publicEmail,
      website: page.website,
      instagram: page.instagram,
      serviceHours: page.serviceHours,
      properties: cards,
      totalProperties: cards.length,
    };
  }

  private toCard(slug: string, p: Property & { media: PropertyMedia[] }): PublicPropertyCard {
    // media já vem ordenada com a capa primeiro.
    const capa = p.media[0] ?? null;
    const d = detalhes(p);

    return {
      code: p.code,
      title: p.title,
      type: p.type,
      purpose: p.purpose,
      priceLabel: precoLegivel(p.purpose, precoEfetivo(p)),
      // Bairro e cidade valem para qualquer addressDisplay: rua e número
      // nunca aparecem na listagem, só (talvez) no detalhe.
      locationLine: [p.neighborhood, p.city].filter(Boolean).join(", ") || null,
      coverUrl: capa ? `/api/public/corretor/${slug}/imoveis/${p.code}/foto/${capa.id}` : null,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      parkingSpots: d.parkingSpots,
      area: d.area,
      highlighted: p.highlightOrder != null,
    };
  }
}

// ---------------------------------------------------------------------------
// Utilitários puros da vitrine
// ---------------------------------------------------------------------------

type ComMidia = Property & { media: PropertyMedia[] };

/** Ordenação in-place. Preço/área nulos vão para o fim, nunca para o topo. */
function ordenar(lista: ComMidia[], sort: string): void {
  const porDestaque = (a: ComMidia, b: ComMidia) =>
    (a.highlightOrder ?? 99) - (b.highlightOrder ?? 99) ||
    b.updatedAt.getTime() - a.updatedAt.getTime();

  if (sort === "recentes") {
    lista.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } else if (sort === "menor_preco") {
    lista.sort(
      (a, b) => (precoEfetivo(a) ?? Number.MAX_SAFE_INTEGER) - (precoEfetivo(b) ?? Number.MAX_SAFE_INTEGER),
    );
  } else if (sort === "maior_preco") {
    lista.sort((a, b) => (precoEfetivo(b) ?? -1) - (precoEfetivo(a) ?? -1));
  } else if (sort === "maior_area") {
    lista.sort((a, b) => (detalhes(b).area ?? -1) - (detalhes(a).area ?? -1));
  } else {
    lista.sort(porDestaque);
  }
}

function mimeDaChave(chave: string): string {
  const ext = extname(chave).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
