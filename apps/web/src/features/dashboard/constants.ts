import type { DashboardAlerts } from "@nexlar/shared";

/** Fonte única dos rótulos das colunas do funil. */
export { FUNNEL_LABELS } from "../funnel/labels";

export type AlertTone = "neutral" | "attention";

export interface AlertDef {
  key: keyof DashboardAlerts;
  label: string;
  /** Destino previsto da lista filtrada. A rota entra num marco futuro. */
  to: string;
  tone: AlertTone;
}

/**
 * Definição dos alertas na ordem de exibição. O `to` aponta para o caminho
 * previsto da lista de leads filtrada (DASH-04); a rota chega com o módulo de leads.
 */
export const ALERT_DEFS: AlertDef[] = [
  { key: "newLeadsAwaitingContact", label: "Aguardando 1º contato", to: "/leads?filtro=aguardando-contato", tone: "attention" },
  { key: "leadsWithoutFollowUp", label: "Sem follow-up", to: "/leads?filtro=sem-follow-up", tone: "attention" },
  { key: "stalledLeads", label: "Leads parados", to: "/leads?filtro=parados", tone: "attention" },
  { key: "pendingDocuments", label: "Documentos pendentes", to: "/leads?filtro=documentacao-pendente", tone: "neutral" },
  { key: "pendingSimulations", label: "Simulações pendentes", to: "/leads?filtro=simulacao-pendente", tone: "neutral" },
];
