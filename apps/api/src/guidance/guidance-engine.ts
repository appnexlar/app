import { Injectable } from "@nestjs/common";
import type { GuidanceRecommendation } from "@nexlar/shared";
import type { GuidanceContext } from "./guidance-context";
import {
  GUIDANCE_DEFINITIONS,
  type GuidanceDefinition,
} from "./guidance-definitions";

/** Estado persistido de uma orientação para um corretor, do ponto de vista do
 *  motor. Vem do banco, mas o motor não sabe disso: recebe só o essencial. */
export interface ProgressSnapshot {
  status:
    | "available"
    | "shown"
    | "dismissed"
    | "skipped"
    | "in_progress"
    | "completed"
    | "reopened"
    | "expired";
  /** Quando foi dispensada ou adiada. Base dos períodos de reapresentação. */
  dismissedAt: Date | null;
}

const RANK: Record<GuidanceRecommendation["type"], number> = {
  critical: 0,
  operational: 1,
  educational: 2,
};

/** Uma operacional dispensada volta depois de 3 dias, se ainda fizer sentido. */
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** "Fazer depois" é mais leve: volta no dia seguinte. */
const SKIP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Motor de recomendações (§11). Puro: função do contexto e do estado das
 * orientações, sem banco nem interface. Toda a política de prioridade (§12) e
 * de reapresentação (§16) mora aqui, num lugar só, testável isoladamente.
 */
@Injectable()
export class GuidanceEngine {
  /**
   * Todas as orientações elegíveis e visíveis agora, já ordenadas: crítica
   * antes de operacional antes de educacional; dentro da categoria, prioridade
   * maior primeiro. A primeira da lista é a recomendação principal (§11).
   */
  rank(
    ctx: GuidanceContext,
    progress: Map<string, ProgressSnapshot>,
  ): GuidanceRecommendation[] {
    const visiveis = GUIDANCE_DEFINITIONS.filter((def) =>
      this.deveMostrar(def, ctx, progress.get(def.key)),
    );

    visiveis.sort((a, b) => {
      if (RANK[a.category] !== RANK[b.category]) {
        return RANK[a.category] - RANK[b.category];
      }
      return b.priority - a.priority;
    });

    return visiveis.map((def) => this.toRecommendation(def));
  }

  /** A recomendação principal, ou null quando não há nada a orientar. */
  next(
    ctx: GuidanceContext,
    progress: Map<string, ProgressSnapshot>,
  ): GuidanceRecommendation | null {
    return this.rank(ctx, progress)[0] ?? null;
  }

  private deveMostrar(
    def: GuidanceDefinition,
    ctx: GuidanceContext,
    estado: ProgressSnapshot | undefined,
  ): boolean {
    // GUI-01: só aparece se a condição da tela/conta bater.
    if (!def.eligible(ctx)) return false;

    if (!estado) return true; // nunca vista: elegível basta

    switch (estado.status) {
      case "completed":
      case "expired":
        // GUI-03: concluída ou sem relevância não reaparece.
        return false;

      case "dismissed":
        return this.passouCooldown(def, estado, ctx.now, DISMISS_COOLDOWN_MS);

      case "skipped":
        return this.passouCooldown(def, estado, ctx.now, SKIP_COOLDOWN_MS);

      // available, shown, in_progress, reopened: continua elegível, então mostra.
      default:
        return true;
    }
  }

  /**
   * Política de reapresentação por categoria (§16):
   *  - crítica ("sempre"): insiste enquanto a condição existir, sem esperar;
   *  - operacional ("reapresentar_se_relevante"): volta após o período, já que
   *    ser elegível aqui significa que a pendência continua de pé;
   *  - educacional ("nunca_reapresentar"): fechou, não volta sozinha.
   */
  private passouCooldown(
    def: GuidanceDefinition,
    estado: ProgressSnapshot,
    agora: Date,
    janelaMs: number,
  ): boolean {
    if (def.dismissPolicy === "sempre") return true;
    if (def.dismissPolicy === "nunca_reapresentar") return false;
    if (!estado.dismissedAt) return true;
    return agora.getTime() - estado.dismissedAt.getTime() >= janelaMs;
  }

  private toRecommendation(def: GuidanceDefinition): GuidanceRecommendation {
    return {
      key: def.key,
      type: def.category,
      title: def.title,
      description: def.description,
      actionLabel: def.actionLabel,
      actionUrl: def.actionUrl,
      actionType: def.actionType,
      priority: def.priority,
      sourceRule: def.key,
      dismissible: def.dismissible,
    };
  }
}
