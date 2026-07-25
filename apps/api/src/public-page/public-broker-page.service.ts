import { Injectable, NotFoundException } from "@nestjs/common";
import type { Readable } from "node:stream";
import { extname } from "node:path";
import type { Broker, BrokerPublicPage, Property, PropertyMedia } from "@prisma/client";
import {
  DETAIL_FIELDS,
  PUBLIC_PAGE_SIZE,
  type FieldDef,
  type PropertyCategory,
  type PublicBrokerPageResponse,
  type PublicBrokerPageView,
  type PublicListingQuery,
  type PublicListingResponse,
  type PublicPropertyCard,
  type PublicPropertyDetailResponse,
  type PublicRentTerms,
  type PublicSpecGroup,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { PropertyPublicationService } from "./property-publication.service";

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

    const d = detalhes(property);
    const preco = precoEfetivo(property);
    const base = `/api/public/corretor/${slug}/imoveis/${property.code}/foto`;
    // Endereço detalhado só sai quando o corretor escolheu mostrar o endereço.
    // Condomínio e ponto de referência entregam o local tão bem quanto a rua.
    const podeLocalizar =
      property.addressDisplay === "completo" || property.addressDisplay === "sem_numero";

    return {
      available: true,
      property: {
        code: property.code,
        title: property.title,
        type: property.type,
        purpose: property.purpose,
        priceLabel: precoLegivel(property.purpose, preco),
        condoFeeLabel: moeda(property.condoFee),
        iptuLabel: moeda(property.iptu),
        description: property.description,
        locationLine: linhaDeLocalizacao(property),
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms,
        parkingSpots: d.parkingSpots,
        area: d.area,
        features: property.features,
        acceptsFinancing: property.acceptsFinancing,
        acceptsFgts: property.acceptsFgts,
        acceptsTrade: property.acceptsTrade,
        priceNegotiable: property.priceNegotiable,
        furnished: property.furnished,
        category: property.category,
        condoName: podeLocalizar ? property.condoName : null,
        reference: podeLocalizar ? property.reference : null,
        specs: fichaTecnica(property),
        rentTerms: condicoesDeLocacao(property),
        photos: property.media
          .filter((m) => m.kind === "foto")
          .map((m) => ({ url: `${base}/${m.id}`, caption: m.caption })),
        videos: property.media
          .filter((m) => m.kind === "video")
          .map((m) => ({ url: `${base}/${m.id}`, caption: m.caption })),
        links: property.media
          .filter((m) => m.kind === "link_externo" && m.externalUrl)
          .map((m) => ({ url: m.externalUrl as string, caption: m.caption })),
        highlighted: property.highlightOrder != null,
      },
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

/** Minúsculas e sem acento, para busca e comparação de filtros. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** O preço que o visitante compara: venda quando existe, senão locação. */
function precoEfetivo(p: Property): number | null {
  if (p.salePrice != null) return Number(p.salePrice);
  if (p.rentPrice != null) return Number(p.rentPrice);
  return null;
}

/** Números do details (Json) com validação de tipo. */
function detalhes(p: Property): {
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  area: number | null;
} {
  const raw = (p.details ?? {}) as Record<string, unknown>;
  const numero = (chave: string): number | null => {
    const v = raw[chave];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    bedrooms: numero("bedrooms"),
    bathrooms: numero("bathrooms"),
    parkingSpots: numero("parkingSpots"),
    area: numero("builtArea") ?? numero("totalArea"),
  };
}

/**
 * A régua de elegibilidade pergunta "tem foto?". Como a página do imóvel também
 * carrega vídeo e link, o veredito recebe uma cópia só com as fotos: vídeo não
 * vira foto por estar na mesma lista.
 */
function soFotos<T extends { media: PropertyMedia[] }>(p: T): T {
  return { ...p, media: p.media.filter((m) => m.kind === "foto") };
}

/**
 * Ficha técnica do anúncio: tudo que o corretor preencheu em `details`, com o
 * rótulo do próprio formulário de cadastro (DETAIL_FIELDS). Agrupa por tipo de
 * informação para a leitura no celular não virar uma lista de trinta linhas.
 *
 * O que já está em destaque no topo da página (quartos, banheiros, vagas, a
 * área principal e mobiliado) fica de fora, para a ficha não repetir o que o
 * visitante acabou de ler. Só entra o que tem valor: booleano falso e texto
 * vazio somem, porque "Piscina: não" é ruído, não informação.
 */
function fichaTecnica(p: Property): PublicSpecGroup[] {
  const campos: FieldDef[] = DETAIL_FIELDS[p.category as PropertyCategory] ?? [];
  const raw = (p.details ?? {}) as Record<string, unknown>;

  const chaveDaArea = typeof raw.builtArea === "number" ? "builtArea" : "totalArea";
  const jaMostrado = new Set(["bedrooms", "bathrooms", "parkingSpots", "furnished", chaveDaArea]);

  const medidas: { label: string; value: string }[] = [];
  const numeros: { label: string; value: string }[] = [];
  const temQue: { label: string; value: string }[] = [];
  const textos: { label: string; value: string }[] = [];

  for (const campo of campos) {
    if (jaMostrado.has(campo.key)) continue;
    const valor = raw[campo.key];

    if (campo.kind === "number") {
      if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
      // Ano não leva separador de milhar: "2.019" não é ano, é erro de leitura.
      const numero = campo.key.toLowerCase().includes("year")
        ? String(valor)
        : valor.toLocaleString("pt-BR");
      const formatado = `${numero}${campo.suffix ? ` ${campo.suffix}` : ""}`;
      (campo.suffix ? medidas : numeros).push({ label: campo.label, value: formatado });
      continue;
    }

    if (campo.kind === "boolean") {
      if (valor === true) temQue.push({ label: campo.label, value: "Sim" });
      continue;
    }

    if (typeof valor === "string" && valor.trim()) {
      textos.push({ label: campo.label, value: valor.trim() });
    }
  }

  // As comodidades escritas à mão entram no mesmo bloco dos atributos marcados:
  // para o visitante, "Piscina" digitada e piscina marcada são a mesma coisa.
  // Deduplica sem acento e sem caixa, senão "Churrasqueira" aparece duas vezes.
  const vistos = new Set(temQue.map((i) => normalizar(i.label)));
  for (const feature of p.features) {
    const limpo = feature.trim();
    if (!limpo || vistos.has(normalizar(limpo))) continue;
    vistos.add(normalizar(limpo));
    temQue.push({ label: limpo, value: "Sim" });
  }

  const grupos: PublicSpecGroup[] = [
    { title: "Medidas", kind: "pares", items: medidas },
    { title: "Cômodos e estrutura", kind: "pares", items: numeros },
    { title: "O que o imóvel tem", kind: "itens", items: temQue },
    { title: "Mais detalhes", kind: "pares", items: textos },
  ];
  return grupos.filter((g) => g.items.length > 0);
}

/** Condições de aluguel, só para anúncio que envolve locação e tem algo a dizer. */
function condicoesDeLocacao(p: Property): PublicRentTerms | null {
  if (p.purpose === "venda") return null;

  const termos: PublicRentTerms = {
    guaranteeTypes: p.guaranteeTypes?.trim() || null,
    minTermMonths: p.minTermMonths ?? null,
    otherFees: p.otherFees?.trim() || null,
    availableFromLabel: p.availableFrom
      ? p.availableFrom.toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : null,
    notes: p.rentNotes?.trim() || null,
  };

  return Object.values(termos).some((v) => v != null) ? termos : null;
}

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

/** R$ 1.234, ou nulo quando não informado. */
function moeda(valor: unknown): string | null {
  if (valor == null) return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Linha de localização do detalhe, respeitando o addressDisplay do imóvel.
 * Mesmo comportamento da página de imóvel compartilhado (Seleções).
 */
function linhaDeLocalizacao(p: Property): string | null {
  const bairroCidade = [p.neighborhood, [p.city, p.state].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(", ");
  if (p.addressDisplay === "completo") {
    const linha = [[p.street, p.addressNumber].filter(Boolean).join(", "), bairroCidade]
      .filter(Boolean)
      .join(" - ");
    return linha || null;
  }
  if (p.addressDisplay === "sem_numero") {
    return [p.street, bairroCidade].filter(Boolean).join(" - ") || null;
  }
  if (p.addressDisplay === "aproximado") {
    return bairroCidade ? `${bairroCidade} (região aproximada)` : null;
  }
  return bairroCidade || null;
}

function precoLegivel(purpose: string, price: number | null): string {
  if (price == null) return "Valor sob consulta";
  const valor = price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  return purpose === "locacao" || purpose === "temporada" ? `${valor} / mês` : valor;
}

function mimeDaChave(chave: string): string {
  const ext = extname(chave).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
