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

  async submitInterest(slug: string, propertyCode: number, interest: CreateInterestRequest) {
    // Carrega a página pública (modelo completo, não DTO)
    const brokerPublicPage = await this.prisma.brokerPublicPage.findUnique({
      where: { slug },
    });

    if (!brokerPublicPage || brokerPublicPage.status !== "ativa") {
      throw new NotFoundException("Página não encontrada ou não está ativa");
    }

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

    let leadId: string;
    let isNew = true;

    // Dedupe por whatsapp+brokerId: se já existe, captura o erro
    try {
      const newLead = await this.leadsService.create(brokerPublicPage.brokerId, {
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
          brokerId: brokerPublicPage.brokerId,
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

    // Registra atividade de interesse para ambos os casos (novo ou existente)
    await this.recordInterestActivity(leadId, brokerPublicPage.brokerId, propertyCode, interest.message);

    // Notifica o corretor
    const typeNotif = isNew ? "novo_lead_pagina_publica" : "nova_demonstracao_interesse";
    const titleNotif = isNew ? "Novo interessado na sua página" : "Novo interesse no seu imóvel";
    const bodyNotif = isNew
      ? `${interest.name} (${interest.whatsapp}) se interessou pelo imóvel #${propertyCode}`
      : `${interest.name} demonstrou interesse no imóvel #${propertyCode}`;

    await this.notificationService.create(
      brokerPublicPage.brokerId,
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
    propertyCode: number,
    message?: string,
  ) {
    await this.prisma.leadActivity.create({
      data: {
        id: crypto.randomUUID(),
        brokerId,
        leadId,
        type: "contato",
        description: `Demonstrou interesse no imóvel #${propertyCode} via página pública`,
        metadata: { propertyCode, message: message || null },
      },
    });
  }
}
