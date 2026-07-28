import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  GuidanceChecklist,
  GuidanceState,
  OnboardingStatus,
  SaveDiagnosisDto,
} from "@nexlar/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProductEventService } from "./product-event.service";
import { GuidanceEngine, type ProgressSnapshot } from "./guidance-engine";
import { GuidanceContextBuilder } from "./guidance-context.builder";
import type { GuidanceContext } from "./guidance-context";
import {
  CHECKLIST_MILESTONES,
  GUIDANCE_DEFINITIONS,
  findDefinition,
} from "./guidance-definitions";

/**
 * Serviço de orientação: a fachada da Jornada 2 para o resto do sistema.
 *
 * Junta as três peças puras (contexto, motor, definições) com a persistência
 * (progresso e diagnóstico) e a emissão de eventos. Tudo isolado por broker_id,
 * que chega sempre de fora, do token. O front nunca decide elegibilidade: pede
 * o estado pronto e desenha (§23).
 */
@Injectable()
export class GuidanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ProductEventService,
    private readonly engine: GuidanceEngine,
    private readonly contexto: GuidanceContextBuilder,
  ) {}

  /**
   * Estado completo da experiência guiada para o corretor: a recomendação
   * principal, as secundárias, o checklist e o diagnóstico. É o que o
   * dashboard adaptativo e as telas consomem.
   *
   * Efeito colateral consciente: registra que a recomendação principal foi
   * exibida (SHOWN), porque o estado da orientação depende disso (§10).
   */
  async getState(brokerId: string): Promise<GuidanceState> {
    const ctx = await this.contexto.build(brokerId);
    const progresso = await this.carregarProgresso(brokerId);

    // Conclusão por evento real (GUI-04): o que já tem o marco correspondente
    // fica marcado como concluído, e assim não volta a ser recomendado.
    await this.concluirPorMarcos(brokerId, ctx, progresso);

    // Expiração por mudança de contexto (GUI-09).
    await this.expirarObsoletas(brokerId, ctx, progresso);

    const ranked = this.engine.rank(ctx, progresso);
    const [primary, ...secondary] = ranked;

    if (primary) {
      await this.registrarExibicao(brokerId, primary.key, progresso);
    }

    return {
      primary: primary ?? null,
      secondary,
      checklist: this.montarChecklist(ctx),
      onboarding: await this.getOnboarding(brokerId),
    };
  }

  /** Só o checklist, para telas que não precisam do resto. */
  async getChecklist(brokerId: string): Promise<GuidanceChecklist> {
    const ctx = await this.contexto.build(brokerId);
    return this.montarChecklist(ctx);
  }

  // --- Ações do corretor sobre uma orientação (§16) --------------------------

  /** Fecha uma orientação. Educacional não volta; operacional volta se persistir. */
  async dismiss(brokerId: string, key: string): Promise<void> {
    this.exigirChave(key);
    await this.mudarEstado(brokerId, key, "dismissed", { dismissedAt: new Date() });
    await this.events.trackSafe(brokerId, {
      type: "GUIDANCE_DISMISSED",
      entityType: "guidance",
      entityId: key,
      dedupeKey: `dismissed:${key}`,
    });
  }

  /** Deixa para depois. Mais leve que fechar: volta no dia seguinte. */
  async skip(brokerId: string, key: string): Promise<void> {
    this.exigirChave(key);
    await this.mudarEstado(brokerId, key, "skipped", { dismissedAt: new Date() });
    await this.events.trackSafe(brokerId, {
      type: "GUIDANCE_SKIPPED",
      entityType: "guidance",
      entityId: key,
    });
  }

  /** Reabre uma orientação dispensada (pela central de ajuda, por exemplo). */
  async reopen(brokerId: string, key: string): Promise<void> {
    this.exigirChave(key);
    await this.mudarEstado(brokerId, key, "reopened", {
      dismissedAt: null,
      reopenedAt: new Date(),
    });
    await this.events.trackSafe(brokerId, {
      type: "GUIDANCE_REOPENED",
      entityType: "guidance",
      entityId: key,
    });
  }

  // --- Diagnóstico e primeiro acesso (§5, §6) --------------------------------

  async getOnboarding(brokerId: string): Promise<OnboardingStatus> {
    const perfil = await this.prisma.onboardingProfile.findUnique({
      where: { brokerId },
    });
    return {
      firstAccessSeen: Boolean(perfil?.firstAccessAt),
      diagnosisCompleted: perfil?.diagnosisCompleted ?? false,
      diagnosisSkipped: perfil?.diagnosisSkipped ?? false,
      workMode: perfil?.workMode ?? null,
      businessFocus: perfil?.businessFocus ?? null,
      hasExistingLeads: perfil?.hasExistingLeads ?? null,
      hasExistingProperties: perfil?.hasExistingProperties ?? null,
      calendarProvider: perfil?.calendarProvider ?? null,
    };
  }

  /** Marca que a recepção de primeiro acesso já foi vista. Idempotente. */
  async markFirstAccess(brokerId: string): Promise<void> {
    const now = new Date();
    await this.prisma.onboardingProfile.upsert({
      where: { brokerId },
      create: { brokerId, firstAccessAt: now },
      update: { firstAccessAt: now },
    });
    await this.events.trackSafe(brokerId, { type: "FIRST_LOGIN_COMPLETED", source: "ui" });
  }

  /** Salva as respostas do diagnóstico (ou o fato de ter pulado). */
  async saveDiagnosis(brokerId: string, dto: SaveDiagnosisDto): Promise<OnboardingStatus> {
    const pulou = dto.skipped === true;
    const dados = {
      workMode: dto.workMode,
      businessFocus: dto.businessFocus,
      hasExistingLeads: dto.hasExistingLeads,
      hasExistingProperties: dto.hasExistingProperties,
      calendarProvider: dto.calendarProvider,
      diagnosisCompleted: !pulou,
      diagnosisSkipped: pulou,
    };
    await this.prisma.onboardingProfile.upsert({
      where: { brokerId },
      create: { brokerId, firstAccessAt: new Date(), ...dados },
      update: dados,
    });
    await this.events.trackSafe(brokerId, {
      type: pulou ? "INITIAL_DIAGNOSIS_SKIPPED" : "INITIAL_DIAGNOSIS_COMPLETED",
      source: "ui",
    });
    return this.getOnboarding(brokerId);
  }

  // --- Internos --------------------------------------------------------------

  private montarChecklist(ctx: GuidanceContext): GuidanceChecklist {
    const items = CHECKLIST_MILESTONES.map((m) => ({
      key: m.key,
      title: m.title,
      done: ctx.milestones.has(m.event) || m.derivable(ctx),
      indisponivel: m.indisponivel,
      actionUrl: m.actionUrl,
      actionType: m.actionType,
    }));
    return {
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
    };
  }

  private async carregarProgresso(brokerId: string): Promise<Map<string, ProgressSnapshot>> {
    const linhas = await this.prisma.guidanceProgress.findMany({
      where: { brokerId },
      select: { guidanceKey: true, status: true, dismissedAt: true },
    });
    const mapa = new Map<string, ProgressSnapshot>();
    for (const l of linhas) {
      mapa.set(l.guidanceKey, { status: l.status, dismissedAt: l.dismissedAt });
    }
    return mapa;
  }

  /**
   * Marca como concluída (e emite GUIDANCE_COMPLETED) toda orientação cujo
   * evento de conclusão já aconteceu. É a conclusão por ação real (GUI-04):
   * ninguém marca à mão. Roda barato e só grava o que mudou.
   */
  private async concluirPorMarcos(
    brokerId: string,
    ctx: GuidanceContext,
    progresso: Map<string, ProgressSnapshot>,
  ): Promise<void> {
    for (const def of GUIDANCE_DEFINITIONS) {
      if (!def.completionEvent) continue;
      if (!ctx.milestones.has(def.completionEvent)) continue;
      const atual = progresso.get(def.key);
      if (atual?.status === "completed") continue;

      await this.mudarEstado(brokerId, def.key, "completed", { completedAt: new Date() });
      progresso.set(def.key, { status: "completed", dismissedAt: atual?.dismissedAt ?? null });
      await this.events.trackSafe(brokerId, {
        type: "GUIDANCE_COMPLETED",
        entityType: "guidance",
        entityId: def.key,
        dedupeKey: `completed:${def.key}`,
      });
    }
  }

  /**
   * Marca como expirada (GUI-09) a orientação que o corretor já viu mas que
   * perdeu a relevância pela mudança de contexto, sem ter sido concluída.
   *
   * Restrito de propósito às EDUCACIONAIS: as operacionais (follow-up,
   * negociação sem próxima ação) são recorrentes, e expirar uma delas a
   * impediria de voltar quando a pendência ressurgir. Para elas, deixar de ser
   * elegível já basta para sumir, sem carimbo de expirada.
   */
  private async expirarObsoletas(
    brokerId: string,
    ctx: GuidanceContext,
    progresso: Map<string, ProgressSnapshot>,
  ): Promise<void> {
    for (const def of GUIDANCE_DEFINITIONS) {
      if (def.category !== "educational") continue;
      const atual = progresso.get(def.key);
      if (!atual) continue; // nunca vista, nada a expirar
      if (atual.status === "completed" || atual.status === "expired") continue;
      if (def.eligible(ctx)) continue; // ainda relevante
      // Se concluiu pelo evento real, já virou completed acima; chegar aqui e
      // não ser elegível significa que a relevância se foi por outro caminho.
      await this.mudarEstado(brokerId, def.key, "expired", { expiresAt: new Date() });
      progresso.set(def.key, { status: "expired", dismissedAt: atual.dismissedAt });
    }
  }

  private async registrarExibicao(
    brokerId: string,
    key: string,
    progresso: Map<string, ProgressSnapshot>,
  ): Promise<void> {
    const now = new Date();
    const atual = progresso.get(key);
    // Não rebaixa um estado mais avançado (dismissed/skipped/completed) só por
    // ter sido exibida de novo: exibir é neutro perante a decisão do corretor.
    const proximo =
      !atual || atual.status === "available" ? "shown" : atual.status;

    await this.prisma.guidanceProgress.upsert({
      where: { broker_guidance: { brokerId, guidanceKey: key } },
      create: {
        brokerId,
        guidanceKey: key,
        status: "shown",
        showCount: 1,
        firstShownAt: now,
        lastShownAt: now,
      },
      update: {
        status: proximo,
        showCount: { increment: 1 },
        lastShownAt: now,
      },
    });
  }

  private async mudarEstado(
    brokerId: string,
    key: string,
    status: "dismissed" | "skipped" | "reopened" | "completed" | "expired",
    campos: {
      dismissedAt?: Date | null;
      reopenedAt?: Date;
      completedAt?: Date;
      expiresAt?: Date;
    },
  ): Promise<void> {
    const now = new Date();
    await this.prisma.guidanceProgress.upsert({
      where: { broker_guidance: { brokerId, guidanceKey: key } },
      create: {
        brokerId,
        guidanceKey: key,
        status,
        firstShownAt: now,
        lastShownAt: now,
        ...campos,
      },
      update: { status, ...campos },
    });
  }

  private exigirChave(key: string): void {
    if (!findDefinition(key)) {
      // Barra chaves inventadas pelo front: não deixa criar progresso órfão
      // nem burlar o catálogo (§20, validar identificadores).
      throw new BadRequestException(`Orientação desconhecida: ${key}`);
    }
  }
}
