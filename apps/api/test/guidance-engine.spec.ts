import { describe, expect, it } from "vitest";
import type { ProductEventType } from "@nexlar/shared";
import { GuidanceEngine, type ProgressSnapshot } from "../src/guidance/guidance-engine";
import type { GuidanceContext } from "../src/guidance/guidance-context";

/**
 * Testes puros do motor de recomendações (§26). Sem banco: monta-se um
 * contexto de mentira e verifica-se a regra. É o que torna a lógica da Jornada
 * 2 barata de testar e confiável.
 */

const AGORA = new Date("2026-07-24T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

/** Contexto onde nada está pendente. Cada teste liga só o que quer provar. */
function contextoBase(over: Partial<GuidanceContext> = {}): GuidanceContext {
  return {
    brokerId: "b1",
    now: AGORA,
    profileComplete: true,
    leadCount: 1,
    leadsSemPreferencias: 0,
    propertyCount: 1,
    matchCount: 1,
    linkCount: 1,
    calendarConfigured: true,
    leadsSemFollowUp: 0,
    negociacoesSemProximaAcao: 0,
    milestones: new Set<ProductEventType>(),
    ...over,
  };
}

function progresso(
  entradas: Record<string, ProgressSnapshot> = {},
): Map<string, ProgressSnapshot> {
  return new Map(Object.entries(entradas));
}

const engine = new GuidanceEngine();

describe("GuidanceEngine — a espinha da jornada", () => {
  it("corretor sem leads: manda cadastrar o primeiro", () => {
    const rec = engine.next(contextoBase({ leadCount: 0 }), progresso());
    expect(rec?.key).toBe("cadastrar-primeiro-lead");
  });

  it("lead sem preferências: sugere adicionar preferências", () => {
    const rec = engine.next(
      contextoBase({ leadCount: 2, leadsSemPreferencias: 1 }),
      progresso(),
    );
    expect(rec?.key).toBe("adicionar-preferencias-lead");
  });

  it("tem lead e nenhum imóvel: sugere cadastrar imóvel", () => {
    const rec = engine.next(contextoBase({ propertyCount: 0 }), progresso());
    expect(rec?.key).toBe("cadastrar-primeiro-imovel");
  });

  it("tem lead e imóvel sem relacionamento: sugere enviar imóvel", () => {
    const rec = engine.next(contextoBase({ matchCount: 0 }), progresso());
    expect(rec?.key).toBe("relacionar-imovel-lead");
  });

  it("nada pendente: não recomenda nada", () => {
    expect(engine.next(contextoBase(), progresso())).toBeNull();
  });

  it("operacional tem prioridade sobre educacional (§12)", () => {
    // Perfil incompleto (educacional) e follow-up vencido (operacional) ao
    // mesmo tempo: a pendência operacional aparece primeiro.
    const ranked = engine.rank(
      contextoBase({ profileComplete: false, leadsSemFollowUp: 1 }),
      progresso(),
    );
    expect(ranked[0].type).toBe("operational");
    expect(ranked[0].key).toBe("follow-up-pendente");
    expect(ranked.some((r) => r.key === "completar-perfil")).toBe(true);
  });

  it("dentro da mesma categoria, a prioridade maior vence", () => {
    // Sem leads (prio 100) e perfil incompleto (prio 90): cadastrar lead ganha.
    const rec = engine.next(
      contextoBase({ leadCount: 0, profileComplete: false }),
      progresso(),
    );
    expect(rec?.key).toBe("cadastrar-primeiro-lead");
  });

  it("educacional dispensada não reaparece (GUI-03)", () => {
    const ctx = contextoBase({ profileComplete: false });
    const rec = engine.next(
      ctx,
      progresso({ "completar-perfil": { status: "dismissed", dismissedAt: AGORA } }),
    );
    expect(rec).toBeNull();
  });

  it("operacional dispensada some no período e volta depois", () => {
    const ctx = contextoBase({ leadsSemFollowUp: 1 });

    const recem = engine.next(
      ctx,
      progresso({ "follow-up-pendente": { status: "dismissed", dismissedAt: AGORA } }),
    );
    expect(recem).toBeNull();

    const antiga = engine.next(
      ctx,
      progresso({
        "follow-up-pendente": {
          status: "dismissed",
          dismissedAt: new Date(AGORA.getTime() - 4 * DIA),
        },
      }),
    );
    expect(antiga?.key).toBe("follow-up-pendente");
  });

  it("'fazer depois' volta já no dia seguinte", () => {
    const ctx = contextoBase({ leadsSemFollowUp: 1 });

    const hoje = engine.next(
      ctx,
      progresso({ "follow-up-pendente": { status: "skipped", dismissedAt: AGORA } }),
    );
    expect(hoje).toBeNull();

    const ontem = engine.next(
      ctx,
      progresso({
        "follow-up-pendente": {
          status: "skipped",
          dismissedAt: new Date(AGORA.getTime() - 2 * DIA),
        },
      }),
    );
    expect(ontem?.key).toBe("follow-up-pendente");
  });

  it("concluída não volta a ser recomendada (GUI-04)", () => {
    const rec = engine.next(
      contextoBase({ leadCount: 0 }),
      progresso({ "cadastrar-primeiro-lead": { status: "completed", dismissedAt: null } }),
    );
    expect(rec).toBeNull();
  });

  it("expirada não aparece (GUI-09)", () => {
    const rec = engine.next(
      contextoBase({ propertyCount: 0 }),
      progresso({ "cadastrar-primeiro-imovel": { status: "expired", dismissedAt: null } }),
    );
    expect(rec).toBeNull();
  });
});
