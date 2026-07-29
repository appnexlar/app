import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PublicBrokerPageService } from "./public-broker-page.service";
import { PropertyPublicationService } from "./property-publication.service";
import { LeadsService } from "../leads/leads.service";
import { NotificationService } from "../notification/notification.service";
import { CreateInterestRequest } from "@nexlar/shared";

@Injectable()
export class PublicInterestService {
  constructor(
    private prisma: PrismaService,
    private brokerPageService: PublicBrokerPageService,
    private propertyService: PropertyPublicationService,
    private leadsService: LeadsService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Interesse num imóvel específico da vitrine.
   */
  async submitInterest(slug: string, propertyCode: number, interest: CreateInterestRequest) {
    const brokerPublicPage = await this.paginaAtiva(slug);

    // Carrega o imóvel com mídia para validação de elegibilidade
    const property = await this.prisma.property.findFirst({
      where: { code: propertyCode, brokerId: brokerPublicPage.brokerId },
      include: { media: true },
    });

    if (!property) {
      throw new NotFoundException("Imóvel não encontrado");
    }

    const eligibility = this.propertyService.eligibility(property);
    if (!eligibility.eligible) {
      throw new BadRequestException("Imóvel não está disponível para demonstração de interesse");
    }

    return this.registrarContato(brokerPublicPage.brokerId, interest, propertyCode);
  }

  /**
   * Contato geral pela vitrine, sem imóvel: é o que acontece quando o visitante
   * toca em "Chamar no WhatsApp". Antes esse toque abria o WhatsApp direto e o
   * corretor ficava com uma conversa solta no celular, sem lead, sem origem e
   * sem funil. Aqui a pessoa vira lead antes de a conversa começar.
   */
  async submitContact(slug: string, contact: CreateInterestRequest) {
    const brokerPublicPage = await this.paginaAtiva(slug);
    return this.registrarContato(brokerPublicPage.brokerId, contact);
  }

  /** A vitrine só recebe contato enquanto estiver no ar. */
  private async paginaAtiva(slug: string) {
    const brokerPublicPage = await this.prisma.brokerPublicPage.findUnique({ where: { slug } });

    if (!brokerPublicPage || brokerPublicPage.status !== "ativa") {
      throw new NotFoundException("Página não encontrada ou não está ativa");
    }
    return brokerPublicPage;
  }

  /**
   * O caminho comum aos dois: cria (ou reencontra) a lead, guarda o
   * consentimento, registra a atividade e avisa o corretor.
   */
  private async registrarContato(
    brokerId: string,
    interest: CreateInterestRequest,
    propertyCode?: number,
  ) {
    let leadId: string;
    let isNew = true;

    // Dedupe por whatsapp+brokerId: se já existe, captura o erro
    try {
      const newLead = await this.leadsService.create(brokerId, {
        fullName: interest.name,
        whatsapp: interest.whatsapp,
        source: "pagina_publica",
      });
      leadId = newLead.id;
      isNew = true;

      // Consentimento LGPD para novo lead
      await this.prisma.consent.create({
        data: {
          id: crypto.randomUUID(),
          brokerId,
          leadId,
          purpose: "contato_pagina_publica",
          textVersion: "1.0",
        },
      });
    } catch (err: any) {
      // Lead duplicado: pega o ID existente do erro
      if (err.status === 409 && err.response?.details?.existingLead?.id) {
        leadId = err.response.details.existingLead.id;
        isNew = false;
      } else {
        throw err;
      }
    }

    // Registra a atividade nos dois casos (lead nova ou já existente)
    await this.recordInterestActivity(leadId, brokerId, propertyCode, interest.message);

    // Notifica o corretor. Sem imóvel a mensagem não pode falar de imóvel
    // nenhum: o que aconteceu foi um contato pela vitrine.
    const sobreImovel = propertyCode !== undefined;
    const typeNotif = isNew ? "novo_lead_pagina_publica" : "nova_demonstracao_interesse";
    const titleNotif = isNew ? "Novo interessado na sua página" : "Novo contato pela sua página";
    const quem = `${interest.name} (${interest.whatsapp})`;
    const bodyNotif = sobreImovel
      ? `${quem} se interessou pelo imóvel #${propertyCode}`
      : `${quem} quer falar com você pelo WhatsApp`;

    await this.notificationService.create(
      brokerId,
      typeNotif,
      titleNotif,
      bodyNotif,
      `/leads/${leadId}`,
    );

    return { success: true, message: "Seu interesse foi registrado com sucesso!" };
  }

  private async recordInterestActivity(
    leadId: string,
    brokerId: string,
    propertyCode: number | undefined,
    message?: string,
  ) {
    await this.prisma.leadActivity.create({
      data: {
        id: crypto.randomUUID(),
        brokerId,
        leadId,
        type: "contato",
        description:
          propertyCode !== undefined
            ? `Demonstrou interesse no imóvel #${propertyCode} via página pública`
            : "Pediu contato pelo WhatsApp na página pública",
        metadata: { propertyCode: propertyCode ?? null, message: message || null },
      },
    });
  }
}
