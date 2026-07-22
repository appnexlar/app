import { z } from "zod";
import type { LeadDetail } from "../leads/dto";

/**
 * Conversão de lead em cliente e área de Clientes (docs/02 §2.16, §4.2.4).
 * Lead e cliente são a MESMA pessoa: a conversão nunca duplica o cadastro.
 * Só a rota POST /leads/:id/convert produz o efeito; mudar status não converte.
 */

export const CONVERSION_REASONS = [
  "inicio_financiamento",
  "solicitacao_documentos",
  "analise_cadastral",
  "preparacao_proposta",
  "negociacao_formal",
  "processo_locacao",
  "outro",
] as const;
export type ConversionReason = (typeof CONVERSION_REASONS)[number];

export const CONVERSION_NEXT_STEPS = [
  "coletar_dados",
  "solicitar_documentos",
  "registrar_simulacao",
  "preparar_proposta",
  "iniciar_analise_cadastral",
  "iniciar_negociacao",
] as const;
export type ConversionNextStep = (typeof CONVERSION_NEXT_STEPS)[number];

export const CLIENT_PURPOSES = ["compra", "locacao"] as const;
export type ClientPurpose = (typeof CLIENT_PURPOSES)[number];

/** Texto e versão do aviso LGPD apresentado antes da coleta de dados extras. */
export const CONSENT_VERSION = "v1-2026-07";
export const CONSENT_TEXT =
  "Os dados serão utilizados para atendimento imobiliário, análise, proposta, financiamento ou locação, conforme a etapa escolhida. Colete apenas as informações necessárias para esta finalidade.";

/**
 * Conversão consciente. Motivo e próxima etapa obrigatórios; "outro" exige
 * descrição; ciência (consent) obrigatória; imóvel opcional. A API revalida.
 */
export const convertLeadSchema = z
  .object({
    reason: z.enum(CONVERSION_REASONS),
    reasonDetail: z.string().trim().max(300).optional(),
    nextStep: z.enum(CONVERSION_NEXT_STEPS),
    purpose: z.enum(CLIENT_PURPOSES),
    propertyId: z.string().uuid().optional(),
    consent: z.literal(true, {
      errorMap: () => ({ message: "É preciso confirmar a ciência sobre a coleta de dados." }),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.reason === "outro" && !data.reasonDetail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasonDetail"],
        message: "Descreva o motivo da conversão.",
      });
    }
  });
export type ConvertLeadDto = z.infer<typeof convertLeadSchema>;

/** Dados da conversão (para a ficha do cliente). */
export interface ConversionSummary {
  convertedAt: string;
  reason: ConversionReason;
  reasonDetail: string | null;
  nextStep: ConversionNextStep;
  purpose: ClientPurpose;
  propertyId: string | null;
  propertyTitle: string | null;
}

/** Registro de consentimento LGPD. */
export interface ConsentSummary {
  id: string;
  purpose: string;
  textVersion: string;
  acceptedAt: string;
}

/**
 * Item da lista de Clientes: SÓ campos seguros. Nunca inclui CPF, renda,
 * documentos ou dados financeiros (esses ficam na ficha, nas seções sensíveis).
 */
export interface ClientSummary {
  id: string;
  fullName: string;
  whatsapp: string;
  status: string;
  convertedAt: string | null;
  purpose: ClientPurpose | null;
  reason: ConversionReason | null;
  relatedPropertyId: string | null;
  relatedPropertyTitle: string | null;
  nextActionAt: string | null;
  lastContactAt: string | null;
}

/** Ficha do cliente: reaproveita a jornada da lead + dados da conversão. */
export interface ClientDetail extends LeadDetail {
  convertedAt: string | null;
  conversion: ConversionSummary | null;
  consents: ConsentSummary[];
  /** Dados pessoais progressivos (nulo até o primeiro preenchimento). */
  profile: ClientProfileData | null;
  /** Estado atual da negociação (nulo até o primeiro preenchimento). */
  negotiation: ClientNegotiationData | null;
  /** Dados financeiros sensíveis (nulo até o primeiro preenchimento). */
  financial: ClientFinancialData | null;
  participants: ParticipantSummary[];
  /** Última solicitação de exclusão de dados, quando houver. */
  deletionRequest: DeletionRequestSummary | null;
}

// --- Perfil do cliente (fatia 2): coleta progressiva ------------------------

export const MARITAL_STATUSES = [
  "solteiro",
  "casado",
  "uniao_estavel",
  "divorciado",
  "viuvo",
  "outro",
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const PAYMENT_METHODS = [
  "a_vista",
  "financiamento",
  "fgts_mais_financiamento",
  "permuta",
  "outro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null))
    .nullable();

/** CPF só com dígitos (11). Aceita entrada formatada e normaliza. */
const cpfSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || v.length === 11, "CPF precisa ter 11 dígitos")
  .transform((v) => (v ? v : null))
  .optional()
  .nullable();

const cepSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || v.length === 8, "CEP precisa ter 8 dígitos")
  .transform((v) => (v ? v : null))
  .optional()
  .nullable();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null))
  .nullable();

/**
 * Dados pessoais do cliente. NENHUM campo é obrigatório (coleta progressiva:
 * exija só o que a etapa atual precisa); valida-se o que for preenchido.
 */
export const updateClientProfileSchema = z.object({
  cpf: cpfSchema,
  rg: optionalText(30),
  birthDate: dateOnly,
  maritalStatus: z.enum(MARITAL_STATUSES).optional().or(z.literal("")).transform((v) => (v ? v : null)).nullable(),
  nationality: optionalText(80),
  residenceCountry: optionalText(80),
  cep: cepSchema,
  street: optionalText(160),
  addressNumber: optionalText(20),
  complement: optionalText(80),
  neighborhood: optionalText(120),
  city: optionalText(120),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a sigla da UF (ex.: SP)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null))
    .nullable(),
  altPhone: optionalText(20),
});
export type UpdateClientProfileDto = z.infer<typeof updateClientProfileSchema>;

/** Estado atual da negociação (mutável; o registro histórico é a conversão). */
export const updateClientNegotiationSchema = z.object({
  propertyValue: z.number().positive().optional().nullable(),
  interestDate: dateOnly,
  expectedTerm: optionalText(80),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().or(z.literal("")).transform((v) => (v ? v : null)).nullable(),
  needsFinancing: z.boolean().optional().nullable(),
  notes: optionalText(2000),
});
export type UpdateClientNegotiationDto = z.infer<typeof updateClientNegotiationSchema>;

export interface ClientProfileData {
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  maritalStatus: MaritalStatus | null;
  nationality: string | null;
  residenceCountry: string | null;
  cep: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  altPhone: string | null;
}

export interface ClientNegotiationData {
  propertyValue: number | null;
  interestDate: string | null;
  expectedTerm: string | null;
  paymentMethod: PaymentMethod | null;
  needsFinancing: boolean | null;
  notes: string | null;
}

// --- Dados financeiros (fatia 3, sensível) ----------------------------------

export const INCOME_TYPES = [
  "assalariado",
  "autonomo",
  "empresario",
  "aposentado",
  "profissional_liberal",
  "outro",
] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

const optBool = z.boolean().optional().nullable();

export const updateClientFinancialSchema = z.object({
  incomeType: z.enum(INCOME_TYPES).optional().or(z.literal("")).transform((v) => (v ? v : null)).nullable(),
  monthlyIncome: z.number().nonnegative().optional().nullable(),
  occupation: optionalText(160),
  activityTime: optionalText(80),
  downPayment: z.number().nonnegative().optional().nullable(),
  hasFgts: optBool,
  preferredBank: optionalText(120),
  hasIncomeComposition: optBool,
  dependentsCount: z.number().int().min(0).max(30).optional().nullable(),
  notes: optionalText(2000),
});
export type UpdateClientFinancialDto = z.infer<typeof updateClientFinancialSchema>;

export interface ClientFinancialData {
  incomeType: IncomeType | null;
  monthlyIncome: number | null;
  occupation: string | null;
  activityTime: string | null;
  downPayment: number | null;
  hasFgts: boolean | null;
  preferredBank: string | null;
  hasIncomeComposition: boolean | null;
  dependentsCount: number | null;
  notes: string | null;
}

// --- Participantes adicionais ------------------------------------------------

export const PARTICIPANT_RELATIONS = [
  "conjuge",
  "comprador_conjunto",
  "locatario_conjunto",
  "fiador",
  "dependente",
  "procurador",
  "outro",
] as const;
export type ParticipantRelation = (typeof PARTICIPANT_RELATIONS)[number];

const participantCpf = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || v.length === 11, "CPF precisa ter 11 dígitos")
  .transform((v) => (v ? v : null))
  .optional()
  .nullable();

export const upsertParticipantSchema = z.object({
  relation: z.enum(PARTICIPANT_RELATIONS),
  fullName: z.string().trim().min(2, "Informe o nome").max(160),
  cpf: participantCpf,
  phone: optionalText(20),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .max(160)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null))
    .nullable(),
  notes: optionalText(500),
});
export type UpsertParticipantDto = z.infer<typeof upsertParticipantSchema>;

export interface ParticipantSummary {
  id: string;
  relation: ParticipantRelation;
  fullName: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

// --- Solicitação de exclusão de dados (LGPD) --------------------------------

export const DELETION_STATUSES = ["solicitada", "em_analise", "concluida", "negada"] as const;
export type DeletionStatus = (typeof DELETION_STATUSES)[number];

export const requestDeletionSchema = z.object({
  reason: optionalText(500),
});
export type RequestDeletionDto = z.infer<typeof requestDeletionSchema>;

export interface DeletionRequestSummary {
  id: string;
  status: DeletionStatus;
  reason: string | null;
  requestedAt: string;
  handledAt: string | null;
}

const boolFromQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

/** Filtros da lista de clientes (fatia 1: busca + finalidade + imóvel). */
export const listClientsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  purpose: z.enum(CLIENT_PURPOSES).optional(),
  hasRelatedProperty: boolFromQuery,
});
export type ListClientsQuery = z.infer<typeof listClientsSchema>;
