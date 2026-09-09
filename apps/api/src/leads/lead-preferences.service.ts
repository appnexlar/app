import { Injectable, NotFoundException } from "@nestjs/common";
import type { LeadPreferenceView, UpsertLeadPreferenceDto } from "@nexlar/shared";
import type { LeadPreference } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "../guidance/product-event.service";

/**
 * Preferências estruturadas do cliente: o que ele procura, em campos que a
 * pesquisa de imóveis e a compatibilidade conseguem usar. No máximo uma por
 * pessoa; salvar substitui o conjunto inteiro (a tela edita tudo junto).
 *
 * Desde a unificação (set 2026) este é o único lugar das preferências: o
 * cadastro rápido grava aqui, a ficha edita aqui. Região e faixa de preço
 * ainda são espelhadas nas colunas antigas de lead até a etapa que as remove,
 * para que lista e funil continuem lendo o que sempre leram.
 *
 * Nada aqui é obrigatório: perfil incompleto orienta, nunca bloqueia.
 */
@Injectable()
export class LeadPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
  ) {}

  async get(brokerId: string, leadId: string): Promise<LeadPreferenceView | null> {
    await this.assertLead(brokerId, leadId);
    const pref = await this.prisma.leadPreference.findFirst({ where: { leadId, brokerId } });
    return pref ? this.toView(pref) : null;
  }

  async upsert(
    brokerId: string,
    leadId: string,
    dto: UpsertLeadPreferenceDto,
  ): Promise<LeadPreferenceView> {
    await this.assertLead(brokerId, leadId);

    const data = {
      purpose: dto.purpose ?? null,
      types: dto.types ?? [],
      cities: dto.cities ?? [],
      neighborhoods: dto.neighborhoods ?? [],
      region: dto.region || null,
      priceMin: dto.priceMin ?? null,
      priceMax: dto.priceMax ?? null,
      bedroomsMin: dto.bedroomsMin ?? null,
      bathroomsMin: dto.bathroomsMin ?? null,
      parkingMin: dto.parkingMin ?? null,
      areaMin: dto.areaMin ?? null,
      areaMax: dto.areaMax ?? null,
      furnished: dto.furnished ?? null,
      features: dto.features ?? [],
      restrictions: dto.restrictions ?? null,
      notes: dto.notes ?? null,
    };

    const pref = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.leadPreference.upsert({
        where: { leadId },
        create: { brokerId, leadId, ...data },
        update: data,
      });
      // Espelho nas colunas antigas (ver comentário da classe).
      await tx.lead.update({
        where: { id: leadId },
        data: {
          region: data.region,
          budgetMin: data.priceMin != null ? new Prisma.Decimal(data.priceMin) : null,
          budgetMax: data.priceMax != null ? new Prisma.Decimal(data.priceMax) : null,
        },
      });
      await tx.leadActivity.create({
        data: {
          brokerId,
          leadId,
          type: "nota",
          description: "Preferências de busca atualizadas",
          metadata: { kind: "preferencias" },
        },
      });
      // Marco da jornada guiada ("Adicionar preferências a um cliente").
      // Idempotente: a segunda vez não regrava.
      await this.events.track(
        brokerId,
        { type: "LEAD_PREFERENCES_ADDED", source: "ui", entityType: "lead", entityId: leadId },
        tx,
      );
      return saved;
    });
    return this.toView(pref);
  }

  private async assertLead(brokerId: string, leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, brokerId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Cliente não encontrado.");
  }

  private toView(p: LeadPreference): LeadPreferenceView {
    return {
      purpose: p.purpose,
      types: p.types,
      cities: p.cities,
      neighborhoods: p.neighborhoods,
      region: p.region,
      priceMin: p.priceMin != null ? Number(p.priceMin) : null,
      priceMax: p.priceMax != null ? Number(p.priceMax) : null,
      bedroomsMin: p.bedroomsMin,
      bathroomsMin: p.bathroomsMin,
      parkingMin: p.parkingMin,
      areaMin: p.areaMin,
      areaMax: p.areaMax,
      furnished: p.furnished,
      features: p.features,
      restrictions: p.restrictions,
      notes: p.notes,
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
