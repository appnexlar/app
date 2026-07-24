import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CATEGORY_DETAILS_SCHEMAS,
  CATEGORY_TYPES,
  type ChangeStatusDto,
  type ConfirmAvailabilityDto,
  type CreatePropertyDto,
  type DuplicateCandidate,
  type KnownPartner,
  type ListPropertiesQuery,
  type PropertyContactDto,
  type PropertyContactSummary,
  type PropertyDetail,
  type PropertyListResponse,
  type PropertySummary,
  type UpdatePropertyDto,
} from "@nexlar/shared";
import { Prisma } from "@prisma/client";
import type { Property, PropertyContact, PropertyMedia } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "../guidance/product-event.service";

type PropertyWithMedia = Property & { media: PropertyMedia[] };
type PropertyFull = Property & { media: PropertyMedia[]; contacts: PropertyContact[] };

/** Pontua quão completo é um registro de parceiro (mais campos = melhor). */
function score(p: KnownPartner): number {
  return [p.creci, p.whatsapp, p.email, p.agencyName].filter(Boolean).length;
}

const SORT_ORDERS: Record<string, Prisma.PropertyOrderByWithRelationInput[]> = {
  recentes: [{ createdAt: "desc" }],
  antigos: [{ createdAt: "asc" }],
  menor_valor: [{ salePrice: { sort: "asc", nulls: "last" } }, { rentPrice: { sort: "asc", nulls: "last" } }],
  maior_valor: [{ salePrice: { sort: "desc", nulls: "last" } }, { rentPrice: { sort: "desc", nulls: "last" } }],
  atualizacao: [{ updatedAt: "desc" }],
  titulo: [{ title: "asc" }],
};

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
  ) {}

  /** Cria o rascunho (etapa 1). Nunca bloqueia por duplicidade: só avisa. */
  async create(brokerId: string, dto: CreatePropertyDto) {
    const property = await this.prisma.property.create({
      data: {
        brokerId,
        title: dto.title,
        purpose: dto.purpose,
        category: dto.category,
        type: dto.type,
        origin: dto.origin,
        externalCode: dto.externalCode,
        externalLink: dto.externalLink,
      },
      include: { media: true },
    });
    // Marco da Jornada 2. Fora de transação e sem derrubar o cadastro: se o
    // registro do evento falhar, o imóvel já está salvo e é o que importa.
    await this.events.trackSafe(brokerId, {
      type: "FIRST_PROPERTY_CREATED",
      source: "ui",
      entityType: "property",
      entityId: property.id,
    });
    return this.toSummary(property);
  }

  /**
   * Possíveis duplicidades na carteira DESTE corretor: código externo, link
   * original ou endereço normalizado. Informativo, nunca bloqueante.
   */
  async findDuplicates(
    brokerId: string,
    params: { externalCode?: string; externalLink?: string; street?: string; addressNumber?: string; complement?: string; excludeId?: string },
  ): Promise<DuplicateCandidate[]> {
    const conditions: { where: Prisma.PropertyWhereInput; matchedBy: DuplicateCandidate["matchedBy"] }[] = [];
    if (params.externalCode) {
      conditions.push({
        where: { externalCode: { equals: params.externalCode, mode: "insensitive" } },
        matchedBy: "codigo_externo",
      });
    }
    if (params.externalLink) {
      conditions.push({
        where: { externalLink: { equals: params.externalLink, mode: "insensitive" } },
        matchedBy: "link",
      });
    }
    if (params.street && params.addressNumber) {
      conditions.push({
        where: {
          street: { equals: params.street.trim(), mode: "insensitive" },
          addressNumber: { equals: params.addressNumber.trim(), mode: "insensitive" },
          ...(params.complement
            ? { complement: { equals: params.complement.trim(), mode: "insensitive" } }
            : {}),
        },
        matchedBy: "endereco",
      });
    }

    const seen = new Map<string, DuplicateCandidate>();
    for (const { where, matchedBy } of conditions) {
      const found = await this.prisma.property.findMany({
        where: { brokerId, ...where, ...(params.excludeId ? { id: { not: params.excludeId } } : {}) },
        take: 3,
      });
      for (const p of found) {
        if (!seen.has(p.id)) {
          seen.set(p.id, {
            id: p.id,
            code: p.code,
            title: p.title,
            status: p.status,
            city: p.city,
            neighborhood: p.neighborhood,
            matchedBy,
          });
        }
      }
    }
    return [...seen.values()];
  }

  /**
   * Parceiros que ESTE corretor já cadastrou antes (reuso). Busca só na
   * carteira do próprio broker: nunca expõe dados de outros corretores do
   * Nexlar. A rede entre contas (verificar se o parceiro tem conta) é feature
   * separada, com consentimento, fora do MVP.
   */
  async searchPartners(brokerId: string, q: string): Promise<KnownPartner[]> {
    const term = q.trim();
    if (term.length < 2) return [];

    const contacts = await this.prisma.propertyContact.findMany({
      where: {
        brokerId,
        roles: { has: "corretor_parceiro" },
        name: { contains: term, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Dedup por nome + CRECI, priorizando o registro mais completo.
    const byKey = new Map<string, KnownPartner>();
    for (const c of contacts) {
      const key = `${c.name.toLowerCase()}|${(c.creci ?? "").toLowerCase()}`;
      const existing = byKey.get(key);
      const candidate: KnownPartner = {
        name: c.name,
        creci: c.creci,
        whatsapp: c.whatsapp,
        email: c.email,
        agencyName: c.agencyName,
      };
      if (!existing || score(candidate) > score(existing)) byKey.set(key, candidate);
    }
    return [...byKey.values()].slice(0, 8);
  }

  async list(brokerId: string, query: ListPropertiesQuery): Promise<PropertyListResponse> {
    const where: Prisma.PropertyWhereInput = { brokerId };

    if (query.purpose) where.purpose = query.purpose;
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    else where.status = { not: "arquivado" };
    if (query.origin) where.origin = query.origin;
    if (query.city) where.city = { contains: query.city, mode: "insensitive" };
    if (query.neighborhood)
      where.neighborhood = { contains: query.neighborhood, mode: "insensitive" };
    if (query.availabilityConfirmed !== undefined)
      where.availabilityConfirmed = query.availabilityConfirmed;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const range: { gte?: number; lte?: number } = {};
      if (query.minPrice !== undefined) range.gte = query.minPrice;
      if (query.maxPrice !== undefined) range.lte = query.maxPrice;
      where.OR = [{ salePrice: range }, { rentPrice: range }];
    }
    if (query.bedrooms !== undefined)
      where.details = { path: ["bedrooms"], gte: query.bedrooms };
    if (query.parkingSpots !== undefined)
      where.details = { path: ["parkingSpots"], gte: query.parkingSpots };
    if (query.q) {
      const q = query.q;
      const search: Prisma.PropertyWhereInput[] = [
        { title: { contains: q, mode: "insensitive" } },
        { externalCode: { contains: q, mode: "insensitive" } },
        { street: { contains: q, mode: "insensitive" } },
        { neighborhood: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { condoName: { contains: q, mode: "insensitive" } },
        { contacts: { some: { name: { contains: q, mode: "insensitive" } } } },
        { contacts: { some: { agencyName: { contains: q, mode: "insensitive" } } } },
      ];
      const asNumber = Number(q.replace(/\D/g, ""));
      if (Number.isInteger(asNumber) && asNumber > 0) search.push({ code: asNumber });
      where.AND = [{ OR: search }];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where,
        include: { media: { where: { status: { not: "removido" } } } },
        orderBy: SORT_ORDERS[query.sort] ?? SORT_ORDERS.recentes,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return {
      items: items.map((p) => this.toSummary(p)),
      total,
      page: query.page,
      perPage: query.perPage,
    };
  }

  async findOne(brokerId: string, id: string): Promise<PropertyDetail> {
    const property = await this.getOwned(brokerId, id);
    return this.toDetail(property);
  }

  async update(brokerId: string, id: string, dto: UpdatePropertyDto): Promise<PropertyDetail> {
    const current = await this.getOwned(brokerId, id);

    const category = dto.category ?? current.category;
    const type = dto.type ?? current.type;
    if (!CATEGORY_TYPES[category].includes(type)) {
      throw new BadRequestException("Tipo não pertence à categoria escolhida.");
    }

    // Campos específicos validados pelo schema da categoria: sem quarto em
    // terreno, sem doca em apartamento.
    let details = dto.details;
    if (details !== undefined) {
      const parsed = CATEGORY_DETAILS_SCHEMAS[category].safeParse(details);
      if (!parsed.success) {
        throw new BadRequestException("Campos específicos inválidos para esta categoria.");
      }
      details = parsed.data as Record<string, unknown>;
    }

    const { details: _d, availableFrom, originDetails, ...rest } = dto;
    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        ...(details !== undefined ? { details: details as Prisma.InputJsonValue } : {}),
        ...(originDetails !== undefined
          ? { originDetails: originDetails as Prisma.InputJsonValue }
          : {}),
        ...(availableFrom !== undefined
          ? { availableFrom: availableFrom ? new Date(availableFrom) : null }
          : {}),
      },
      include: { media: { where: { status: { not: "removido" } } }, contacts: true },
    });
    return this.toDetail(updated);
  }

  /**
   * Mudança de status. Publicar (tornar disponível) exige o mínimo para o
   * imóvel ser apresentável: localização e valor conforme a finalidade.
   */
  async changeStatus(brokerId: string, id: string, dto: ChangeStatusDto): Promise<PropertyDetail> {
    const property = await this.getOwned(brokerId, id);

    if (dto.status === "disponivel") {
      const missing: string[] = [];
      if (!property.city) missing.push("cidade");
      if (!property.neighborhood) missing.push("bairro");
      const needsSale = property.purpose === "venda" || property.purpose === "venda_locacao";
      const needsRent =
        property.purpose === "locacao" ||
        property.purpose === "venda_locacao" ||
        property.purpose === "temporada";
      if (needsSale && property.salePrice == null) missing.push("valor de venda");
      if (needsRent && property.rentPrice == null) missing.push("valor da locação");
      if (missing.length > 0) {
        throw new BadRequestException(
          `Para deixar o imóvel disponível, preencha: ${missing.join(", ")}.`,
        );
      }
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: { status: dto.status },
      include: { media: { where: { status: { not: "removido" } } }, contacts: true },
    });
    return this.toDetail(updated);
  }

  async confirmAvailability(
    brokerId: string,
    id: string,
    dto: ConfirmAvailabilityDto,
  ): Promise<PropertyDetail> {
    await this.getOwned(brokerId, id);
    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        availabilityConfirmed: true,
        availabilityConfirmedAt: new Date(),
        availabilityConfirmedBy: dto.confirmedBy,
        availabilityNextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : null,
        availabilityNote: dto.note,
      },
      include: { media: { where: { status: { not: "removido" } } }, contacts: true },
    });
    return this.toDetail(updated);
  }

  /** Duplica o cadastro (sem mídias), voltando a rascunho. */
  async duplicate(brokerId: string, id: string): Promise<PropertySummary> {
    const source = await this.getOwned(brokerId, id);
    const created = await this.prisma.property.create({
      data: {
        brokerId,
        title: `${source.title} (cópia)`,
        purpose: source.purpose,
        category: source.category,
        type: source.type,
        status: "rascunho",
        description: source.description,
        internalNotes: source.internalNotes,
        externalCode: source.externalCode,
        externalLink: source.externalLink,
        origin: source.origin,
        originDetails: source.originDetails ?? Prisma.JsonNull,
        zip: source.zip,
        street: source.street,
        addressNumber: source.addressNumber,
        complement: source.complement,
        neighborhood: source.neighborhood,
        city: source.city,
        state: source.state,
        latitude: source.latitude,
        longitude: source.longitude,
        reference: source.reference,
        condoName: source.condoName,
        addressDisplay: source.addressDisplay,
        salePrice: source.salePrice,
        acceptsFinancing: source.acceptsFinancing,
        acceptsFgts: source.acceptsFgts,
        acceptsTrade: source.acceptsTrade,
        priceNegotiable: source.priceNegotiable,
        commissionNotes: source.commissionNotes,
        rentPrice: source.rentPrice,
        condoFee: source.condoFee,
        iptu: source.iptu,
        otherFees: source.otherFees,
        guaranteeTypes: source.guaranteeTypes,
        minTermMonths: source.minTermMonths,
        furnished: source.furnished,
        availableFrom: source.availableFrom,
        rentNotes: source.rentNotes,
        details: source.details ?? Prisma.JsonNull,
        features: source.features,
      },
      include: { media: true },
    });
    return this.toSummary(created);
  }

  async remove(brokerId: string, id: string): Promise<void> {
    await this.getOwned(brokerId, id);
    await this.prisma.property.delete({ where: { id } });
  }

  // --- Contatos (pessoas envolvidas) ---------------------------------------

  async addContact(
    brokerId: string,
    propertyId: string,
    dto: PropertyContactDto,
  ): Promise<PropertyContactSummary> {
    await this.getOwned(brokerId, propertyId);
    const contact = await this.prisma.propertyContact.create({
      data: { brokerId, propertyId, ...dto },
    });
    return this.toContact(contact);
  }

  async updateContact(
    brokerId: string,
    propertyId: string,
    contactId: string,
    dto: PropertyContactDto,
  ): Promise<PropertyContactSummary> {
    await this.getOwnedContact(brokerId, propertyId, contactId);
    const contact = await this.prisma.propertyContact.update({
      where: { id: contactId },
      data: dto,
    });
    return this.toContact(contact);
  }

  async removeContact(brokerId: string, propertyId: string, contactId: string): Promise<void> {
    await this.getOwnedContact(brokerId, propertyId, contactId);
    await this.prisma.propertyContact.delete({ where: { id: contactId } });
  }

  // --- Internos --------------------------------------------------------------

  /** Isolamento por corretor: id + brokerId sempre juntos. */
  private async getOwned(brokerId: string, id: string): Promise<PropertyFull> {
    const property = await this.prisma.property.findFirst({
      where: { id, brokerId },
      include: {
        media: { where: { status: { not: "removido" } }, orderBy: { sortOrder: "asc" } },
        contacts: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!property) throw new NotFoundException("Imóvel não encontrado.");
    return property;
  }

  private async getOwnedContact(brokerId: string, propertyId: string, contactId: string) {
    const contact = await this.prisma.propertyContact.findFirst({
      where: { id: contactId, propertyId, brokerId },
    });
    if (!contact) throw new NotFoundException("Contato não encontrado.");
    return contact;
  }

  private mediaUrl(media: PropertyMedia): string | null {
    if (media.externalUrl) return media.externalUrl;
    if (!media.storagePath) return null;
    return `/api/properties/${media.propertyId}/media/${media.id}/file`;
  }

  private coverUrl(media: PropertyMedia[]): string | null {
    const photos = media.filter((m) => m.kind === "foto" && m.status === "pronto");
    const cover = photos.find((m) => m.isCover) ?? photos[0];
    return cover ? this.mediaUrl(cover) : null;
  }

  private toSummary(p: PropertyWithMedia): PropertySummary {
    const details = (p.details ?? {}) as Record<string, number | undefined>;
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      purpose: p.purpose,
      category: p.category,
      type: p.type,
      status: p.status,
      origin: p.origin,
      city: p.city,
      neighborhood: p.neighborhood,
      salePrice: p.salePrice ? Number(p.salePrice) : null,
      rentPrice: p.rentPrice ? Number(p.rentPrice) : null,
      bedrooms: details.bedrooms ?? null,
      bathrooms: details.bathrooms ?? null,
      parkingSpots: details.parkingSpots ?? null,
      mainArea: details.totalArea ?? details.usableArea ?? details.builtArea ?? null,
      coverUrl: this.coverUrl(p.media),
      availabilityConfirmed: p.availabilityConfirmed,
      updatedAt: p.updatedAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    };
  }

  private toContact(c: PropertyContact): PropertyContactSummary {
    return {
      id: c.id,
      name: c.name,
      roles: c.roles,
      phone: c.phone,
      whatsapp: c.whatsapp,
      email: c.email,
      creci: c.creci,
      agencyName: c.agencyName,
      notes: c.notes,
    };
  }

  private toDetail(p: PropertyFull): PropertyDetail {
    return {
      ...this.toSummary(p),
      description: p.description,
      internalNotes: p.internalNotes,
      externalCode: p.externalCode,
      externalLink: p.externalLink,
      originDetails: (p.originDetails as PropertyDetail["originDetails"]) ?? null,
      zip: p.zip,
      street: p.street,
      addressNumber: p.addressNumber,
      complement: p.complement,
      state: p.state,
      country: p.country,
      latitude: p.latitude,
      longitude: p.longitude,
      reference: p.reference,
      condoName: p.condoName,
      addressDisplay: p.addressDisplay,
      acceptsFinancing: p.acceptsFinancing,
      acceptsFgts: p.acceptsFgts,
      acceptsTrade: p.acceptsTrade,
      priceNegotiable: p.priceNegotiable,
      commissionNotes: p.commissionNotes,
      condoFee: p.condoFee ? Number(p.condoFee) : null,
      iptu: p.iptu ? Number(p.iptu) : null,
      otherFees: p.otherFees,
      guaranteeTypes: p.guaranteeTypes,
      minTermMonths: p.minTermMonths,
      furnished: p.furnished,
      availableFrom: p.availableFrom ? p.availableFrom.toISOString().slice(0, 10) : null,
      rentNotes: p.rentNotes,
      details: (p.details as PropertyDetail["details"]) ?? null,
      features: p.features,
      availabilityConfirmedAt: p.availabilityConfirmedAt?.toISOString() ?? null,
      availabilityConfirmedBy: p.availabilityConfirmedBy,
      availabilityNextReviewAt: p.availabilityNextReviewAt
        ? p.availabilityNextReviewAt.toISOString().slice(0, 10)
        : null,
      availabilityNote: p.availabilityNote,
      contacts: p.contacts.map((c) => this.toContact(c)),
      media: p.media.map((m) => ({
        id: m.id,
        kind: m.kind,
        origin: m.origin,
        authorized: m.authorized,
        status: m.status,
        url: this.mediaUrl(m),
        externalUrl: m.externalUrl,
        caption: m.caption,
        room: m.room,
        isCover: m.isCover,
        sortOrder: m.sortOrder,
      })),
    };
  }
}
