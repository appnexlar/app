import type { FunnelGroup } from "@nexlar/shared";

/** Rótulos das colunas do funil, na ordem de exibição (docs/02 §2.9). */
export const FUNNEL_LABELS: Record<FunnelGroup, string> = {
  novos: "Novos",
  atendimento: "Atendimento",
  imoveis_enviados: "Imóveis enviados",
  visitas: "Visitas",
  negociacao: "Negociação",
  clientes: "Fechados",
  encerradas: "Encerradas",
};
