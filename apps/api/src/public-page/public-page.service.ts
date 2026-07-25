import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma, type Broker, type BrokerPublicPage, type PublicPageStatus } from "@prisma/client";
import {
  isReservedSlug,
  normalizeSlug,
  slugSchema,
  type MyPublicPage,
  type MyPublicPageState,
  type PublicPageRequirement,
  type PublicPageRequirements,
  type SlugAvailability,
  type UpdatePublicPageDto,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PropertyPublicationService } from "./property-publication.service";

/** Versão vigente dos termos de publicação. Sobe quando o texto mudar. */
const PUBLICATION_TERMS_VERSION = "2026-07";

/**
 * A página com o dono junto: quase tudo aqui precisa dos reusos da conta
 * (foto, CRECI, imobiliária), então carregamos sempre os dois.
 */
type PageComDono = BrokerPublicPage & { broker: Broker };

/**
 * Máquina de estados da página. Cada transição válida está aqui, e só aqui;
 * quem quiser mudar o estado passa por `mudarStatus`, que valida e audita.
 *
 * `restrita` de propósito não tem saída: só script administrativo desfaz
 * (GUI de admin não existe no MVP). `incompleta` -> `ativa` passa pela
 * validação de requisitos no publish, não por transição livre.
 */
const TRANSICOES: Record<PublicPageStatus, readonly PublicPageStatus[]> = {
  rascunho: ["incompleta", "ativa", "restrita"],
  incompleta: ["ativa", "restrita"],
  ativa: ["pausada", "incompleta", "restrita"],
  pausada: ["ativa", "incompleta", "restrita"],
  restrita: [],
};

@Injectable()
export class PublicPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publication: PropertyPublicationService,
  ) {}

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  /**
   * Estado completo para a tela "Minha Página". Cria o rascunho na primeira
   * visita, pré-preenchido com o que a conta já sabe (nome, telefone), para o
   * corretor nunca encarar formulário vazio do zero.
   *
   * Efeito colateral consciente: se a página está `ativa` mas perdeu um
   * requisito mínimo (ex.: o único imóvel elegível foi vendido), ela cai para
   * `incompleta` aqui, porque página no ar sem requisito é vitrine quebrada.
   */
  async getState(brokerId: string): Promise<MyPublicPageState> {
    let page = await this.ensurePage(brokerId);
    const requirements = await this.buildRequirements(page);

    if (page.status === "ativa" && !requirements.canPublish) {
      page = await this.mudarStatus(page, "incompleta", {
        motivo: "requisito_perdido",
        pendentes: requirements.items.filter((i) => !i.completed).map((i) => i.key),
      });
    }

    return { page: this.toDto(page), requirements };
  }

  // -------------------------------------------------------------------------
  // Edição
  // -------------------------------------------------------------------------

  async update(brokerId: string, dto: UpdatePublicPageDto): Promise<MyPublicPageState> {
    const page = await this.ensurePage(brokerId);

    const data: Prisma.BrokerPublicPageUpdateInput = {};

    // Campos de texto/lista: presença no DTO decide; null limpa o campo.
    const copiar = <K extends keyof UpdatePublicPageDto & keyof Prisma.BrokerPublicPageUpdateInput>(
      campo: K,
    ) => {
      if (dto[campo] !== undefined) {
        (data as Record<string, unknown>)[campo] = dto[campo];
      }
    };
    copiar("professionalName");
    copiar("headline");
    copiar("bio");
    copiar("mainCity");
    copiar("regions");
    copiar("focus");
    copiar("propertyTypes");
    copiar("languages");
    copiar("publicWhatsapp");
    copiar("publicPhone");
    copiar("publicEmail");
    copiar("website");
    copiar("instagram");
    copiar("serviceHours");

    // Aceite dos termos: só liga, com prova de versão. Nunca desliga por PATCH.
    if (dto.acceptPublicationTerms && !page.publicationTermsAcceptedAt) {
      data.publicationTermsAcceptedAt = new Date();
      data.publicationTermsVersion = PUBLICATION_TERMS_VERSION;
    }

    // Slug: normaliza a digitação, valida o canônico e deixa a constraint
    // única do banco decidir a corrida.
    if (dto.slug !== undefined) {
      if (dto.slug === null) {
        // Remover o endereço de uma página no ar deixaria o link morto.
        if (page.status === "ativa") {
          throw new BadRequestException("Pause a página antes de remover o endereço público.");
        }
        data.slug = null;
      } else {
        const canonico = normalizeSlug(dto.slug);
        const valido = slugSchema.safeParse(canonico);
        if (!valido.success) {
          throw new BadRequestException(
            valido.error.issues[0]?.message ?? "Endereço público inválido.",
          );
        }
        data.slug = canonico;
      }
    }

    try {
      const atualizada = await this.prisma.brokerPublicPage.update({
        where: { brokerId },
        data,
        include: { broker: true },
      });

      // Auditoria do que importa historicamente: endereço e aceite de termos.
      if (data.slug !== undefined && data.slug !== page.slug) {
        await this.audit(brokerId, atualizada.id, "endereco_publico_alterado", {
          de: page.slug,
          para: atualizada.slug,
        });
      }
      if (data.publicationTermsAcceptedAt) {
        await this.audit(brokerId, atualizada.id, "termos_publicacao_aceitos", {
          version: PUBLICATION_TERMS_VERSION,
        });
      }

      const requirements = await this.buildRequirements(atualizada);
      return { page: this.toDto(atualizada), requirements };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Este endereço já está em uso por outro corretor.");
      }
      throw e;
    }
  }

  /**
   * Checagem de disponibilidade para a tela responder enquanto o corretor
   * digita. O veredito final continua sendo a constraint única no update.
   */
  async checkSlug(brokerId: string, bruto: string): Promise<SlugAvailability> {
    const slug = normalizeSlug(bruto);

    const valido = slugSchema.safeParse(slug);
    if (!valido.success) {
      const reservado = slug.length > 0 && isReservedSlug(slug);
      return {
        slug,
        available: false,
        reason: reservado ? "reservado" : "invalido",
        message: valido.error.issues[0]?.message ?? "Endereço inválido.",
      };
    }

    const dono = await this.prisma.brokerPublicPage.findUnique({
      where: { slug },
      select: { brokerId: true },
    });
    if (dono && dono.brokerId !== brokerId) {
      return {
        slug,
        available: false,
        reason: "em_uso",
        message: "Este endereço já está em uso por outro corretor.",
      };
    }

    return { slug, available: true };
  }

  // -------------------------------------------------------------------------
  // Publicação (máquina de estados)
  // -------------------------------------------------------------------------

  async publish(brokerId: string): Promise<MyPublicPageState> {
    const page = await this.ensurePage(brokerId);
    if (page.status === "restrita") {
      throw new ForbiddenException("Esta página está restrita e não pode ser reativada por aqui.");
    }
    if (page.status === "ativa") {
      return { page: this.toDto(page), requirements: await this.buildRequirements(page) };
    }

    const requirements = await this.buildRequirements(page);
    if (!requirements.canPublish) {
      // O estado registra a tentativa honesta; a resposta diz o que falta.
      const pendentes = requirements.items.filter((i) => !i.completed);
      if (page.status !== "incompleta") {
        await this.mudarStatus(page, "incompleta", {
          motivo: "publicacao_sem_requisitos",
          pendentes: pendentes.map((i) => i.key),
        });
      }
      throw new BadRequestException({
        message: "Ainda faltam requisitos para publicar a página.",
        details: { requirements: pendentes },
      });
    }

    const ativa = await this.mudarStatus(page, "ativa", { origem: "publicar" });
    return { page: this.toDto(ativa), requirements };
  }

  async pause(brokerId: string): Promise<MyPublicPageState> {
    const page = await this.ensurePage(brokerId);
    if (page.status === "restrita") {
      throw new ForbiddenException("Esta página está restrita.");
    }
    if (page.status !== "ativa") {
      throw new BadRequestException("Só uma página no ar pode ser pausada.");
    }
    const pausada = await this.mudarStatus(page, "pausada", { origem: "pausar" });
    return { page: this.toDto(pausada), requirements: await this.buildRequirements(pausada) };
  }

  /**
   * Restrição administrativa. NÃO exposta em controller: é chamada por script
   * (mesmo rito do CRECI), e por isso recebe o motivo interno obrigatório.
   */
  async restrict(brokerId: string, reason: string): Promise<void> {
    const page = await this.ensurePage(brokerId);
    if (page.status === "restrita") return;
    await this.prisma.brokerPublicPage.update({
      where: { brokerId },
      data: { status: "restrita", restrictedReason: reason, restrictedAt: new Date() },
    });
    await this.audit(brokerId, page.id, "pagina_publica_restrita", { reason });
  }

  /**
   * Transição validada + auditada. Toda mudança de estado passa por aqui,
   * exceto a restrição administrativa (que tem campos próprios).
   */
  private async mudarStatus(
    page: PageComDono,
    para: PublicPageStatus,
    metadata: Record<string, unknown>,
  ): Promise<PageComDono> {
    if (!TRANSICOES[page.status].includes(para)) {
      throw new BadRequestException(`A página não pode ir de ${page.status} para ${para}.`);
    }

    const agora = new Date();
    const atualizada = await this.prisma.brokerPublicPage.update({
      where: { id: page.id },
      data: {
        status: para,
        ...(para === "ativa" ? { publishedAt: page.publishedAt ?? agora, pausedAt: null } : {}),
        ...(para === "pausada" ? { pausedAt: agora } : {}),
      },
      include: { broker: true },
    });

    await this.audit(page.brokerId, page.id, "pagina_publica_status", {
      de: page.status,
      para,
      ...metadata,
    });

    return atualizada;
  }

  // -------------------------------------------------------------------------
  // Requisitos mínimos de publicação
  // -------------------------------------------------------------------------

  /**
   * A régua que decide se a página pode ir ao ar. Cada item explica a
   * pendência e aponta onde ela se resolve; a tela só desenha.
   */
  private async buildRequirements(page: PageComDono): Promise<PublicPageRequirements> {
    const { broker } = page;

    // Vitrine vazia não é vitrine: exige pelo menos um imóvel marcado como
    // público E elegível, pela regra única do PropertyPublicationService.
    const imovelElegivel = await this.publication.countPublishable(page.brokerId);

    const items: PublicPageRequirement[] = [
      {
        key: "nome_profissional",
        completed: Boolean(page.professionalName?.trim()),
        title: "Nome profissional",
        description: "Como você quer assinar a sua página.",
        actionUrl: "/minha-pagina",
      },
      {
        key: "foto",
        completed: Boolean(broker.avatarKey || broker.avatarUrl),
        title: "Foto profissional",
        description: "Uma boa foto de rosto passa confiança de cara.",
        actionUrl: "/minha-pagina",
      },
      {
        key: "contato",
        completed: Boolean(page.publicWhatsapp || page.publicPhone),
        title: "Contato público",
        description: "WhatsApp ou telefone para o visitante falar com você.",
        actionUrl: "/minha-pagina",
      },
      {
        key: "regiao",
        completed: Boolean(page.mainCity?.trim() || page.regions.length > 0),
        title: "Cidade ou região",
        description: "Onde você atua. É o que o visitante procura primeiro.",
        actionUrl: "/minha-pagina",
      },
      {
        key: "creci",
        completed: Boolean(broker.creci?.trim()),
        title: "CRECI informado",
        description: "Informe seu CRECI no perfil. A verificação vem depois.",
        actionUrl: "/perfil",
      },
      {
        key: "endereco_publico",
        completed: Boolean(page.slug),
        title: "Endereço da página",
        description: "Escolha o seu nexlar.app/corretor/…",
        actionUrl: "/minha-pagina",
      },
      {
        key: "imovel_elegivel",
        completed: imovelElegivel > 0,
        title: "Um imóvel publicado na página",
        description: "Escolha ao menos um imóvel para aparecer na sua vitrine.",
        actionUrl: "/minha-pagina/imoveis",
      },
      {
        key: "termos_publicacao",
        completed: Boolean(page.publicationTermsAcceptedAt),
        title: "Termos de publicação",
        description: "O aceite de responsabilidade pelo conteúdo publicado.",
        actionUrl: "/minha-pagina",
      },
    ];

    const completed = items.filter((i) => i.completed).length;
    return { canPublish: completed === items.length, items, completed, total: items.length };
  }

  // -------------------------------------------------------------------------
  // Infra
  // -------------------------------------------------------------------------

  /** Busca a página do corretor, criando o rascunho pré-preenchido se faltar. */
  private async ensurePage(brokerId: string): Promise<PageComDono> {
    const existente = await this.prisma.brokerPublicPage.findUnique({
      where: { brokerId },
      include: { broker: true },
    });
    if (existente) return existente;

    const broker = await this.prisma.broker.findUniqueOrThrow({ where: { id: brokerId } });
    const soDigitos = broker.phone?.replace(/\D/g, "") ?? "";

    return this.prisma.brokerPublicPage.create({
      data: {
        brokerId,
        professionalName: broker.fullName,
        publicWhatsapp: /^\d{10,15}$/.test(soDigitos) ? soDigitos : null,
      },
      include: { broker: true },
    });
  }

  private async audit(
    brokerId: string,
    pageId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        brokerId,
        action,
        entityType: "broker_public_page",
        entityId: pageId,
        metadata: metadata as Prisma.InputJsonObject,
      },
    });
  }

  /** Serializa para o contrato do shared, juntando os reusos da conta. */
  private toDto(page: PageComDono): MyPublicPage {
    const { broker } = page;
    const verificado = broker.creciStatus === "aprovado";
    return {
      slug: page.slug,
      status: page.status,
      professionalName: page.professionalName,
      headline: page.headline,
      bio: page.bio,
      mainCity: page.mainCity,
      regions: page.regions,
      focus: page.focus,
      propertyTypes: page.propertyTypes,
      languages: page.languages,
      publicWhatsapp: page.publicWhatsapp,
      publicPhone: page.publicPhone,
      publicEmail: page.publicEmail,
      website: page.website,
      instagram: page.instagram,
      serviceHours: page.serviceHours,
      agencyLogoUrl: page.agencyLogoUrl,
      // Mesma regra do perfil: foto enviada vence o link externo, e a URL
      // versionada evita cache de foto antiga.
      photoUrl: broker.avatarKey
        ? `/api/brokers/me/avatar?v=${broker.updatedAt.getTime()}`
        : broker.avatarUrl,
      agencyName: broker.agencyName,
      creci: {
        informed: Boolean(broker.creci?.trim()),
        // Número e UF só saem daqui quando o selo é real, o mesmo critério
        // da página pública do imóvel compartilhado.
        number: verificado ? broker.creci : null,
        uf: verificado ? broker.creciUf : null,
        verified: verificado,
      },
      publicationTermsAcceptedAt: page.publicationTermsAcceptedAt?.toISOString() ?? null,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      pausedAt: page.pausedAt?.toISOString() ?? null,
    };
  }
}
