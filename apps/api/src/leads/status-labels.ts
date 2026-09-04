import type { LeadStatus } from "@nexlar/shared";

/** Rótulos pt-BR das etapas, usados nas descrições da linha do tempo. */
export const STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  preferencias_definidas: "Preferências definidas",
  selecao_em_preparacao: "Seleção em preparação",
  imoveis_enviados: "Imóveis enviados",
  avaliando_imoveis: "Avaliando imóveis",
  visita_solicitada: "Visita solicitada",
  visita_agendada: "Visita agendada",
  visitando_imoveis: "Visitando imóveis",
  imovel_prioritario: "Imóvel prioritário",
  aguardando_decisao: "Aguardando decisão",
  fechado: "Fechado",
  perdida: "Perdida",
  reativar_futuro: "Reativar no futuro",
};
