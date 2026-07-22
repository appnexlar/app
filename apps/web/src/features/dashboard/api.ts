import type { DashboardSummary } from "@nexlar/shared";

/**
 * MOCK TEMPORÁRIO do Dashboard.
 *
 * A tela consome este contrato via TanStack Query. Quando o módulo `dashboard`
 * da API existir, troque o corpo desta função por uma chamada real
 * (ex.: `http.get<DashboardSummary>("/dashboard")`) e remova os dados abaixo.
 * O formato retornado já é o contrato final (@nexlar/shared), então a tela
 * não muda: os números apenas deixam de ser zero.
 *
 * Durante esta fase, `?preview=cheio` na URL devolve um conjunto de exemplo
 * para inspecionar o layout preenchido. Sem isso, devolve um corretor novo
 * (tudo zerado), que é o estado real de quem acabou de criar a conta.
 */
export type PreviewMode = "vazio" | "cheio";

export async function fetchDashboard(mode: PreviewMode): Promise<DashboardSummary> {
  // Atraso pequeno só para exercitar o estado de carregando (skeleton).
  await new Promise((resolve) => setTimeout(resolve, 500));

  return mode === "cheio" ? SAMPLE_SUMMARY : EMPTY_SUMMARY;
}

/** Monta a série mensal terminando no mês corrente (mais antigo primeiro). */
function lastMonths(counts: number[]): { month: string; leads: number }[] {
  const now = new Date();
  return counts.map((leads, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (counts.length - 1 - i), 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month, leads };
  });
}

/** Corretor novo: nada cadastrado ainda. */
const EMPTY_SUMMARY: DashboardSummary = {
  today: { dueToday: [], overdue: [] },
  alerts: {
    newLeadsAwaitingContact: 0,
    leadsWithoutFollowUp: 0,
    stalledLeads: 0,
    pendingDocuments: 0,
    pendingSimulations: 0,
  },
  metrics: {
    leadsThisMonth: 0,
    leadsLastMonth: 0,
    visitsThisWeek: 0,
    visitsLastWeek: 0,
    visitsThisMonth: 0,
    visitsLastMonth: 0,
    openNegotiations: 0,
    negotiationsLastMonth: 0,
    leadsByMonth: lastMonths([0, 0, 0, 0, 0, 0]),
    activeByStage: [
      { group: "novos", count: 0 },
      { group: "atendimento", count: 0 },
      { group: "imoveis_enviados", count: 0 },
      { group: "visitas", count: 0 },
    ],
  },
  conversions: { leadToVisit: 0, visitToNegotiation: 0, avgDaysToClose: null },
};

/** Conjunto de exemplo (?preview=cheio) para inspecionar o layout preenchido. */
const SAMPLE_SUMMARY: DashboardSummary = {
  today: {
    dueToday: [
      { id: "t1", title: "Ligar para confirmar interesse", leadName: "Marina Alves", dueAt: isoToday(10, 0) },
      { id: "t2", title: "Enviar opções de apartamento", leadName: "Rodrigo Peixoto", dueAt: isoToday(15, 30) },
    ],
    overdue: [
      { id: "t3", title: "Retornar contato do WhatsApp", leadName: "Camila Souza", dueAt: isoDaysAgo(2, 9, 0) },
    ],
  },
  alerts: {
    newLeadsAwaitingContact: 3,
    leadsWithoutFollowUp: 2,
    stalledLeads: 4,
    pendingDocuments: 5,
    pendingSimulations: 1,
  },
  metrics: {
    leadsThisMonth: 18,
    leadsLastMonth: 12,
    visitsThisWeek: 2,
    visitsLastWeek: 3,
    visitsThisMonth: 7,
    visitsLastMonth: 5,
    openNegotiations: 2,
    negotiationsLastMonth: 2,
    leadsByMonth: lastMonths([8, 11, 9, 14, 12, 18]),
    activeByStage: [
      { group: "novos", count: 5 },
      { group: "atendimento", count: 4 },
      { group: "imoveis_enviados", count: 5 },
      { group: "visitas", count: 5 },
    ],
  },
  conversions: { leadToVisit: 0.42, visitToNegotiation: 0.55, avgDaysToClose: 34 },
};

function isoToday(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function isoDaysAgo(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
