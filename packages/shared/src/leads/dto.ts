import { z } from "zod";

/**
 * DTOs de leads. J1: só nome e WhatsApp são obrigatórios; todo o resto é
 * opcional e nunca trava o salvamento. Lead nunca exige CPF, renda ou
 * documentos: esses dados só entram na conversão para cliente.
 */

export const LEAD_SOURCES = [
  "instagram",
  "tiktok",
  "whatsapp",
  "indicacao",
  "site",
  "pagina_publica",
  "outro",
] as const;
export const LEAD_INTENTS = ["comprar", "financiar", "investir", "vender", "pesquisar"] as const;
export const LEAD_AUDIENCES = ["brasil", "exterior"] as const;

/**
 * Etapas da jornada comercial da lead (docs/02 §2.9). O status É a etapa do
 * funil. "fechado" nunca é alvo de mudança comum de status:
 * só a ação explícita de conversão chega lá (LEAD-13).
 */
export const LEAD_STATUSES = [
  "novo",
  "em_atendimento",
  "preferencias_definidas",
  "selecao_em_preparacao",
  "imoveis_enviados",
  "avaliando_imoveis",
  "visita_solicitada",
  "visita_agendada",
  "visitando_imoveis",
  "imovel_prioritario",
  "aguardando_decisao",
  "fechado",
  "perdida",
  "reativar_futuro",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadIntent = (typeof LEAD_INTENTS)[number];
export type LeadAudience = (typeof LEAD_AUDIENCES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Colunas do funil, na ordem de exibição. O quadro é enxuto de propósito:
 * mostra só o pipeline vivo + clientes. Perdida/reativar não são colunas
 * ("encerradas" agrupa essas leads fora do quadro): perder ou reativar é uma
 * ação com regras, não um lugar para arrastar.
 */
export const FUNNEL_GROUPS = [
  "novos",
  "atendimento",
  "imoveis_enviados",
  "visitas",
  "clientes",
] as const;
export type FunnelGroup = (typeof FUNNEL_GROUPS)[number] | "encerradas";

/** Etapa → coluna do funil (agrupamento compacto do MVP). */
export const FUNNEL_GROUP_BY_STATUS: Record<LeadStatus, FunnelGroup> = {
  novo: "novos",
  em_atendimento: "atendimento",
  preferencias_definidas: "atendimento",
  selecao_em_preparacao: "imoveis_enviados",
  imoveis_enviados: "imoveis_enviados",
  avaliando_imoveis: "imoveis_enviados",
  visita_solicitada: "visitas",
  visita_agendada: "visitas",
  visitando_imoveis: "visitas",
  imovel_prioritario: "visitas",
  aguardando_decisao: "visitas",
  fechado: "clientes",
  perdida: "encerradas",
  reativar_futuro: "encerradas",
};

/** Aceita colar o número em qualquer formato e normaliza para dígitos. */
export function normalizeWhatsapp(value: string): string {
  return value.replace(/\D/g, "");
}

const whatsappSchema = z
  .string()
  .min(1, "Informe o WhatsApp")
  .transform(normalizeWhatsapp)
  .refine((digits) => digits.length >= 10 && digits.length <= 13, {
    message: "Informe um WhatsApp válido com DDD",
  });

const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

export const createLeadSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome").max(160),
  whatsapp: whatsappSchema,
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido")
    .max(160)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  source: z.enum(LEAD_SOURCES).optional(),
  intent: z.enum(LEAD_INTENTS).optional(),
  audience: z.enum(LEAD_AUDIENCES).optional(),
  region: optionalTrimmed(160),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  notes: optionalTrimmed(2000),
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;

/**
 * Mudança de etapa da lead no funil. Regras (docs/02 §2.9, LEAD-08/LEAD-13):
 * perdida exige motivo; reativar_futuro exige data futura (e a API cria a
 * tarefa de reativação); fechado é recusada aqui, só a ação
 * explícita de conversão chega lá.
 */
export const changeLeadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    lostReason: optionalTrimmed(500),
    // Só para "fechado" (entidade única, set 2026): detalhes do fechamento,
    // todos opcionais. A ciência da coleta vira obrigatória antes do primeiro
    // dado complementar, não aqui.
    purpose: z.enum(["compra", "locacao"]).optional(),
    propertyId: z.string().uuid().optional(),
    closeNote: optionalTrimmed(300),
    reactivateAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato AAAA-MM-DD")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "perdida" && !data.lostReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lostReason"],
        message: "Informe o motivo da perda",
      });
    }
    if (data.status === "reativar_futuro" && !data.reactivateAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reactivateAt"],
        message: "Informe a data para reativar o contato",
      });
    }
  });
export type ChangeLeadStatusDto = z.infer<typeof changeLeadStatusSchema>;

/** Resumo do lead nas respostas da API. */
export interface LeadSummary {
  id: string;
  /** Número curto do lead, usado na URL (/leads/1042) e citável pelo corretor. */
  code: number;
  fullName: string;
  whatsapp: string;
  status: LeadStatus;
  /** Já foi convertida em cliente (a pessoa é a mesma; ver 2.16). */
  isClient: boolean;
  convertedAt: string | null;
  source: LeadSource | null;
  intent: LeadIntent | null;
  region: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  /** Próxima ação agendada; alimenta o card do funil e o alerta de parada. */
  nextActionAt: string | null;
  lastContactAt: string | null;
  createdAt: string;
}

/** Tipos de registro na linha do tempo do lead (espelha o enum do banco). */
export const LEAD_ACTIVITY_TYPES = [
  "nota",
  "mudanca_status",
  "contato",
  "tarefa_criada",
  "tarefa_concluida",
  "visita",
  "documento",
  "simulacao",
  "selecao",
  "conversao",
  "financiamento",
] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

/** Um registro da linha do tempo do lead. */
export interface LeadActivitySummary {
  id: string;
  type: LeadActivityType;
  description: string;
  createdAt: string;
}

/** Ficha completa do lead: tudo do resumo + dados extras + linha do tempo. */
export interface LeadDetail extends LeadSummary {
  email: string | null;
  audience: LeadAudience | null;
  budgetMin: number | null;
  budgetMax: number | null;
  notes: string | null;
  lastContactAt: string | null;
  updatedAt: string;
  activities: LeadActivitySummary[];
}
