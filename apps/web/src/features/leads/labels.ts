import type { LeadActivityType, LeadIntent, LeadSource, LeadStatus } from "@nexlar/shared";

export const SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  site: "Site",
  pagina_publica: "Página pública",
  outro: "Outro",
};

export const INTENT_LABELS: Record<LeadIntent, string> = {
  comprar: "Comprar",
  financiar: "Financiar",
  investir: "Investir",
  vender: "Vender",
  pesquisar: "Pesquisando",
};

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
  convertida_em_cliente: "Cliente",
  perdida: "Perdida",
  reativar_futuro: "Reativar no futuro",
};

/**
 * Tom visual de cada etapa, para a etiqueta ser lida num relance (não só pelo
 * texto). "novo" chama atenção como novidade; etapas de trabalho ficam ativas;
 * cliente é ganho; perdida/reativar recuam para neutro.
 */
export type StatusTone = "novo" | "ativo" | "ganho" | "encerrado";

export const STATUS_TONE: Record<LeadStatus, StatusTone> = {
  novo: "novo",
  em_atendimento: "ativo",
  preferencias_definidas: "ativo",
  selecao_em_preparacao: "ativo",
  imoveis_enviados: "ativo",
  avaliando_imoveis: "ativo",
  visita_solicitada: "ativo",
  visita_agendada: "ativo",
  visitando_imoveis: "ativo",
  imovel_prioritario: "ativo",
  aguardando_decisao: "ativo",
  convertida_em_cliente: "ganho",
  perdida: "encerrado",
  reativar_futuro: "encerrado",
};

/** Classes da etiqueta de status por tom (usa os tokens do design). */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  novo: "bg-[var(--highlight-soft)] text-[var(--highlight-fg)]",
  ativo: "bg-accent-soft text-accent",
  ganho: "bg-success-soft text-success-fg",
  encerrado: "bg-surface-sunken text-text-subtle",
};

export const ACTIVITY_LABELS: Record<LeadActivityType, string> = {
  nota: "Nota",
  mudanca_status: "Mudança de status",
  contato: "Contato",
  tarefa_criada: "Tarefa criada",
  tarefa_concluida: "Tarefa concluída",
  visita: "Visita",
  documento: "Documento",
  simulacao: "Simulação",
  selecao: "Imóvel enviado",
  conversao: "Conversão em cliente",
  financiamento: "Financiamento",
};

/**
 * Categorias da linha do tempo, para filtrar sem ler tudo. O agrupamento segue
 * o assunto como o corretor pensa ("cadê as visitas?"), não a tabela de origem.
 */
export type TimelineCategory = "imoveis" | "visitas" | "financiamento" | "comunicacao" | "andamento";

export const ACTIVITY_CATEGORY: Record<LeadActivityType, TimelineCategory> = {
  selecao: "imoveis",
  visita: "visitas",
  financiamento: "financiamento",
  simulacao: "financiamento",
  contato: "comunicacao",
  nota: "comunicacao",
  mudanca_status: "andamento",
  conversao: "andamento",
  tarefa_criada: "andamento",
  tarefa_concluida: "andamento",
  documento: "andamento",
};

export const TIMELINE_CATEGORY_LABELS: Record<TimelineCategory, string> = {
  imoveis: "Imóveis",
  visitas: "Visitas",
  financiamento: "Financiamento",
  comunicacao: "Comunicação",
  andamento: "Andamento",
};

/** Formata o intervalo de orçamento em reais (ex.: R$ 300.000 a R$ 500.000). */
export function displayBudget(min: number | null, max: number | null): string | null {
  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  if (min != null && max != null) return `${fmt(min)} a ${fmt(max)}`;
  if (min != null) return `A partir de ${fmt(min)}`;
  if (max != null) return `Até ${fmt(max)}`;
  return null;
}

/** Data e hora curtas no formato brasileiro (ex.: 18 de jul., 14:32). */
export function displayDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Exibe os dígitos normalizados como (11) 98888-7766. */
export function displayWhatsapp(digits: string): string {
  const d = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

/** Link de conversa no WhatsApp. Prefixa o DDI 55 quando o número é nacional. */
export function whatsappLink(digits: string): string {
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}`;
}

/** Hoje, Ontem ou data curta brasileira (ex.: 12 de mai.). */
export function displayCreatedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}
