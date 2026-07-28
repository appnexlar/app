import { Injectable } from "@nestjs/common";
import type {
  AvailabilityWindow,
  UpsertVisitAvailabilityDto,
  VisitAvailabilityView,
} from "@nexlar/shared";
import { availabilityWindowSchema } from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "../guidance/product-event.service";

/**
 * Horários em que o corretor aceita visitas. Uma linha por corretor; sem
 * linha (ou sem janelas) a agenda está "não configurada" e a página da lead
 * usa o fallback de solicitação. A regra de ouro do agendamento: nunca
 * inventamos horário que o corretor não abriu.
 */
@Injectable()
export class VisitAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
  ) {}

  async get(brokerId: string): Promise<VisitAvailabilityView> {
    const config = await this.prisma.visitAvailability.findUnique({ where: { brokerId } });
    return this.toView(config);
  }

  async upsert(brokerId: string, dto: UpsertVisitAvailabilityDto): Promise<VisitAvailabilityView> {
    const data = {
      windows: dto.windows,
      slotDurationMin: dto.slotDurationMin,
      minNoticeHours: dto.minNoticeHours,
      maxAdvanceDays: dto.maxAdvanceDays,
    };
    const saved = await this.prisma.visitAvailability.upsert({
      where: { brokerId },
      create: { brokerId, ...data },
      update: data,
    });
    // Marco da Jornada 2: agenda configurada de verdade (com janela aberta).
    if (dto.windows.length > 0) {
      await this.events.track(brokerId, {
        type: "CALENDAR_CONFIGURED",
        source: "ui",
        entityType: "visit_availability",
        entityId: saved.id,
      });
    }
    return this.toView(saved);
  }

  /** Janelas validadas do Json. Linha inválida é descartada, nunca explode. */
  parseWindows(raw: unknown): AvailabilityWindow[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((w) => {
      const parsed = availabilityWindowSchema.safeParse(w);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private toView(
    config: {
      windows: unknown;
      slotDurationMin: number;
      minNoticeHours: number;
      maxAdvanceDays: number;
    } | null,
  ): VisitAvailabilityView {
    const windows = this.parseWindows(config?.windows ?? []);
    return {
      windows,
      slotDurationMin: config?.slotDurationMin ?? 60,
      minNoticeHours: config?.minNoticeHours ?? 12,
      maxAdvanceDays: config?.maxAdvanceDays ?? 14,
      configured: windows.length > 0,
    };
  }
}
