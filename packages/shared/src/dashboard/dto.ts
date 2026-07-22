/**
 * Contrato do Dashboard (J10 / DASH-01 a DASH-07). Fonte única de tipos
 * entre o front e a futura API de agregação (módulo `dashboard`).
 * A API calcula tudo a partir dos dados do corretor; o front só apresenta.
 */

import type { FunnelGroup } from "../leads/dto";

/** Tarefa exibida no bloco de ação do dia. */
export interface DashboardTask {
  id: string;
  title: string;
  leadName: string;
  /** Vencimento em ISO 8601. */
  dueAt: string;
}

/** Contagens dos alertas clicáveis (cada um vira uma lista filtrada no front). */
export interface DashboardAlerts {
  /** Leads novos aguardando primeiro contato. */
  newLeadsAwaitingContact: number;
  /** Leads ativos sem nenhuma tarefa aberta (sem próxima ação). */
  leadsWithoutFollowUp: number;
  /** Leads sem atividade há mais de X dias (padrão 7). */
  stalledLeads: number;
  /** Documentações pendentes. */
  pendingDocuments: number;
  /** Simulações pendentes. */
  pendingSimulations: number;
}

/** Contagem de leads ativos em um grupo do funil. */
export interface FunnelStageCount {
  group: FunnelGroup;
  count: number;
}

/** Contagem de leads em um mês (para o gráfico de evolução). */
export interface MonthCount {
  /** Mês em ISO curto, ex.: "2026-07". */
  month: string;
  leads: number;
}

/**
 * Métricas do mês corrente, sempre acompanhadas do período anterior para o
 * front mostrar a variação (▲/▼) sem calcular nada de negócio.
 */
export interface DashboardMetrics {
  leadsThisMonth: number;
  leadsLastMonth: number;
  visitsThisWeek: number;
  visitsLastWeek: number;
  visitsThisMonth: number;
  visitsLastMonth: number;
  openNegotiations: number;
  negotiationsLastMonth: number;
  /** Últimos meses (mais antigo primeiro, inclui o corrente). */
  leadsByMonth: MonthCount[];
  activeByStage: FunnelStageCount[];
}

/** Taxas de conversão e tempo médio. Percentuais como fração de 0 a 1. */
export interface DashboardConversions {
  leadToVisit: number;
  visitToNegotiation: number;
  /** Média de dias do primeiro contato ao fechamento. null se ainda não há fechamento. */
  avgDaysToClose: number | null;
}

/** Resposta agregada do Dashboard. */
export interface DashboardSummary {
  today: {
    dueToday: DashboardTask[];
    overdue: DashboardTask[];
  };
  alerts: DashboardAlerts;
  metrics: DashboardMetrics;
  conversions: DashboardConversions;
}
