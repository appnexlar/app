import { z } from "zod";
import { isValidCpf } from "../common/documento";
import { PARTICIPANT_RELATIONS } from "../clients/dto";

/**
 * Coleta de dados para simulação de financiamento (docs/09).
 *
 * A solicitação é do corretor; as respostas são do cliente, por link seguro.
 * A Nextlar organiza e valida completude. Quem analisa crédito é o banco:
 * nada aqui aprova, reprova, consulta score ou promete financiamento.
 *
 * As respostas vivem num payload Json por seção (padrão property.details):
 * o rascunho aceita pedaço validado por formato; a exigência de campo
 * obrigatório é da etapa de envio, não do autosave.
 */

// ---------------------------------------------------------------------------
// Vocabulário da solicitação
// ---------------------------------------------------------------------------

export const FINANCING_REQUEST_STATUSES = [
  "rascunho",
  "enviada",
  "respondida",
  "em_revisao",
  "correcao_solicitada",
  "aprovada_para_simulacao",
  "expirada",
  "revogada",
  "arquivada",
] as const;
export type FinancingRequestStatus = (typeof FINANCING_REQUEST_STATUSES)[number];

export const FINANCING_STATUS_LABELS: Record<FinancingRequestStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Aguardando o cliente",
  respondida: "Respondida",
  em_revisao: "Em revisão",
  correcao_solicitada: "Correção solicitada",
  aprovada_para_simulacao: "Pronta para simulação",
  expirada: "Expirada",
  revogada: "Revogada",
  arquivada: "Arquivada",
};

/** Blocos do formulário que o corretor pode pedir. A ordem é a das etapas. */
export const FINANCING_SECTIONS = [
  "dados_pessoais",
  "trabalho_renda",
  "participantes",
  "entrada_fgts",
  "compromissos",
  "imovel",
] as const;
export type FinancingSection = (typeof FINANCING_SECTIONS)[number];

export const FINANCING_SECTION_LABELS: Record<FinancingSection, string> = {
  dados_pessoais: "Sobre você",
  trabalho_renda: "Trabalho e renda",
  participantes: "Outros participantes",
  entrada_fgts: "Entrada e FGTS",
  compromissos: "Compromissos financeiros",
  imovel: "Imóvel e objetivo",
};

/** Prazos de preenchimento (dias). O backend calcula expiresAt no envio. */
export const FINANCING_EXPIRY_OPTIONS = [3, 7, 15, 30] as const;
export type FinancingExpiryDays = (typeof FINANCING_EXPIRY_OPTIONS)[number];

/** Caminho público curto, padrão do /s/ da seleção. */
export const FINANCING_PUBLIC_PATH = "/f";

// ---------------------------------------------------------------------------
// Solicitação: DTOs do corretor
// ---------------------------------------------------------------------------

const secoesSchema = z
  .array(z.enum(FINANCING_SECTIONS))
  .min(1, "Escolha pelo menos um bloco de informações.")
  .transform((v) => [...new Set(v)]);

export const createFinancingRequestSchema = z.object({
  leadId: z.string().uuid(),
  propertyId: z.string().uuid().optional().nullable(),
  sections: secoesSchema.optional(),
  message: z.string().trim().max(500).optional().nullable(),
  expiresInDays: z
    .number()
    .refine((v): v is FinancingExpiryDays => FINANCING_EXPIRY_OPTIONS.includes(v as FinancingExpiryDays), {
      message: "Prazo inválido.",
    })
    .optional(),
  /**
   * O OTP vai por e-mail (decisão docs/09 §5). Quando a lead não tem e-mail,
   * o corretor informa aqui e o dado entra na ficha da lead.
   */
  leadEmail: z.string().trim().email("E-mail inválido.").optional().nullable(),
});
export type CreateFinancingRequestDto = z.infer<typeof createFinancingRequestSchema>;

export const updateFinancingRequestSchema = z.object({
  propertyId: z.string().uuid().optional().nullable(),
  sections: secoesSchema.optional(),
  message: z.string().trim().max(500).optional().nullable(),
  expiresInDays: z
    .number()
    .refine((v): v is FinancingExpiryDays => FINANCING_EXPIRY_OPTIONS.includes(v as FinancingExpiryDays), {
      message: "Prazo inválido.",
    })
    .optional(),
  leadEmail: z.string().trim().email("E-mail inválido.").optional().nullable(),
});
export type UpdateFinancingRequestDto = z.infer<typeof updateFinancingRequestSchema>;

// ---------------------------------------------------------------------------
// Payload das respostas, por seção
// ---------------------------------------------------------------------------
// Formato validado sempre; obrigatoriedade só no envio (Fatia D). Dinheiro em
// número (reais), padrão do restante do shared.

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))
    .optional()
    .nullable();

const dinheiro = z.number().nonnegative().max(999_999_999).optional().nullable();

const cpfOpcional = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || isValidCpf(v), "CPF inválido. Confira os números.")
  .transform((v) => (v ? v : null))
  .optional()
  .nullable();

/** AAAA-MM-DD ou vazio. */
const dataCurta = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.")
  .transform((v) => (v ? v : null))
  .optional()
  .nullable();

export const MARITAL_STATUS_OPTIONS = [
  "solteiro",
  "casado",
  "uniao_estavel",
  "divorciado",
  "viuvo",
] as const;

export const RESIDENCE_SITUATIONS = ["alugada", "propria", "financiada", "com_familiares", "outra"] as const;

export const financingDadosPessoaisSchema = z.object({
  fullName: texto(120),
  cpf: cpfOpcional,
  birthDate: dataCurta,
  nationality: texto(60),
  maritalStatus: z.enum(MARITAL_STATUS_OPTIONS).optional().nullable(),
  propertyRegime: texto(60),
  phone: texto(20),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || /.+@.+\..+/.test(v), "E-mail inválido.")
    .transform((v) => (v ? v : null))
    .optional()
    .nullable(),
  address: texto(160),
  city: texto(80),
  state: texto(2),
  cep: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 8, "CEP precisa ter 8 dígitos")
    .transform((v) => (v ? v : null))
    .optional()
    .nullable(),
  residenceSituation: z.enum(RESIDENCE_SITUATIONS).optional().nullable(),
  dependentsCount: z.number().int().min(0).max(30).optional().nullable(),
});

export const EMPLOYMENT_SITUATIONS = [
  "assalariado",
  "autonomo",
  "empresario",
  "servidor_publico",
  "aposentado",
  "pensionista",
  "informal",
  "desempregado",
  "outro",
] as const;
export type EmploymentSituation = (typeof EMPLOYMENT_SITUATIONS)[number];

export const EMPLOYMENT_SITUATION_LABELS: Record<EmploymentSituation, string> = {
  assalariado: "Empregado (CLT)",
  autonomo: "Autônomo",
  empresario: "Empresário",
  servidor_publico: "Servidor público",
  aposentado: "Aposentado",
  pensionista: "Pensionista",
  informal: "Trabalho informal",
  desempregado: "Sem trabalho no momento",
  outro: "Outra situação",
};

export const INCOME_FREQUENCIES = ["mensal", "quinzenal", "semanal", "variavel"] as const;

export const financingTrabalhoRendaSchema = z.object({
  situation: z.enum(EMPLOYMENT_SITUATIONS).optional().nullable(),
  occupation: texto(80),
  employer: texto(120),
  employmentStartDate: dataCurta,
  employmentBond: texto(60),
  cnpj: texto(18),
  grossMonthlyIncome: dinheiro,
  netMonthlyIncome: dinheiro,
  variableIncome: dinheiro,
  otherIncome: dinheiro,
  otherIncomeSource: texto(120),
  incomeFrequency: z.enum(INCOME_FREQUENCIES).optional().nullable(),
  canProveIncome: z.boolean().optional().nullable(),
});

export const financingParticipanteSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome do participante.")
    .max(120, "Nome do participante muito longo."),
  cpf: cpfOpcional,
  birthDate: dataCurta,
  relation: z.enum(PARTICIPANT_RELATIONS),
  occupation: texto(80),
  monthlyIncome: dinheiro,
  phone: texto(20),
  email: texto(120),
});

/** Máximo de participantes além do titular. */
export const FINANCING_MAX_PARTICIPANTS = 4;

export const financingParticipantesSchema = z.object({
  participants: z.array(financingParticipanteSchema).max(FINANCING_MAX_PARTICIPANTS).default([]),
});

export const DOWN_PAYMENT_SOURCES = [
  "recursos_proprios",
  "venda_de_imovel",
  "ajuda_familiar",
  "fgts",
  "consorcio",
  "outros",
] as const;

export const financingEntradaFgtsSchema = z.object({
  downPaymentAmount: dinheiro,
  downPaymentSources: z.array(z.enum(DOWN_PAYMENT_SOURCES)).max(6).optional().nullable(),
  /** Saldo declarado pelo cliente. Não é consulta oficial ao FGTS. */
  fgtsBalance: dinheiro,
  reserveAmount: dinheiro,
  maxDesiredInstallment: dinheiro,
  notes: texto(300),
});

export const COMMITMENT_TYPES = [
  "financiamento_veiculo",
  "financiamento_imobiliario",
  "emprestimo",
  "consignado",
  "pensao_paga",
  "parcelamento",
  "cartao_recorrente",
  "outro",
] as const;
export type CommitmentType = (typeof COMMITMENT_TYPES)[number];

export const COMMITMENT_TYPE_LABELS: Record<CommitmentType, string> = {
  financiamento_veiculo: "Financiamento de veículo",
  financiamento_imobiliario: "Financiamento imobiliário",
  emprestimo: "Empréstimo",
  consignado: "Consignado",
  pensao_paga: "Pensão paga",
  parcelamento: "Parcelamento",
  cartao_recorrente: "Cartão ou gasto recorrente",
  outro: "Outro compromisso",
};

export const financingCompromissoSchema = z.object({
  type: z.enum(COMMITMENT_TYPES),
  institution: texto(120),
  monthlyInstallment: dinheiro,
  remainingBalance: dinheiro,
  remainingInstallments: z.number().int().min(0).max(600).optional().nullable(),
  notes: texto(200),
});

export const financingCompromissosSchema = z.object({
  commitments: z.array(financingCompromissoSchema).max(10).default([]),
});

export const FINANCING_GOALS = ["moradia", "investimento"] as const;

export const financingImovelSchema = z.object({
  propertyValue: dinheiro,
  goal: z.enum(FINANCING_GOALS).optional().nullable(),
  desiredTermMonths: z.number().int().min(12).max(420).optional().nullable(),
  preferredBank: texto(60),
  useFgts: z.boolean().optional().nullable(),
  notes: texto(300),
});

/** O payload completo do rascunho e da submissão: cada seção é opcional. */
export const financingPayloadSchema = z.object({
  dados_pessoais: financingDadosPessoaisSchema.optional(),
  trabalho_renda: financingTrabalhoRendaSchema.optional(),
  participantes: financingParticipantesSchema.optional(),
  entrada_fgts: financingEntradaFgtsSchema.optional(),
  compromissos: financingCompromissosSchema.optional(),
  imovel: financingImovelSchema.optional(),
});
export type FinancingPayload = z.infer<typeof financingPayloadSchema>;

/** Schema de cada seção, para o backend validar o pedaço que o autosave manda. */
export const FINANCING_SECTION_SCHEMAS: Record<FinancingSection, z.ZodTypeAny> = {
  dados_pessoais: financingDadosPessoaisSchema,
  trabalho_renda: financingTrabalhoRendaSchema,
  participantes: financingParticipantesSchema,
  entrada_fgts: financingEntradaFgtsSchema,
  compromissos: financingCompromissosSchema,
  imovel: financingImovelSchema,
};

// ---------------------------------------------------------------------------
// Envio: consentimento e completude
// ---------------------------------------------------------------------------

/** Propósito e versão do texto de consentimento do formulário de financiamento. */
export const FINANCING_CONSENT_PURPOSE = "coleta_dados_financiamento";
export const FINANCING_CONSENT_VERSION = "fin-v1-2026-08";

/** Origem gravada no Consent quando quem aceita é o cliente, pelo link. */
export const FINANCING_CONSENT_ORIGIN = "formulario_publico";

export const financingSubmitSchema = z.object({
  /** Sem o aceite explícito não há envio. O backend registra o Consent. */
  consent: z.literal(true, {
    errorMap: () => ({ message: "É preciso aceitar o uso dos dados para enviar." }),
  }),
});
export type FinancingSubmitDto = z.infer<typeof financingSubmitSchema>;

export interface FinancingPendency {
  section: FinancingSection;
  message: string;
}

/**
 * O que falta para poder enviar. O rascunho aceita qualquer coisa com formato
 * válido; a régua de obrigatoriedade é esta, aplicada só no envio, e é a mesma
 * no front (revisão mostra pendências) e no back (submit recusa).
 *
 * O mínimo sem o qual não existe simulação: identidade do titular, situação e
 * renda, e o valor de entrada (zero é resposta válida; em branco não é).
 * Participantes, compromissos e imóvel podem legitimamente ficar vazios, então
 * neles vale a conclusão consciente da etapa.
 */
export function financingSubmissionPendencies(
  payload: FinancingPayload,
  sections: FinancingSection[],
  completedSections: FinancingSection[],
): FinancingPendency[] {
  const pendencias: FinancingPendency[] = [];
  const pedir = (section: FinancingSection, message: string) => pendencias.push({ section, message });

  for (const secao of sections) {
    if (!completedSections.includes(secao)) {
      pedir(secao, `Conclua a etapa "${FINANCING_SECTION_LABELS[secao]}".`);
    }
  }

  if (sections.includes("dados_pessoais")) {
    const d = payload.dados_pessoais;
    if (!d?.fullName) pedir("dados_pessoais", "Informe seu nome completo.");
    if (!d?.cpf) pedir("dados_pessoais", "Informe seu CPF.");
    if (!d?.birthDate) pedir("dados_pessoais", "Informe sua data de nascimento.");
  }

  if (sections.includes("trabalho_renda")) {
    const t = payload.trabalho_renda;
    if (!t?.situation) pedir("trabalho_renda", "Informe sua situação de trabalho.");
    if (t?.grossMonthlyIncome == null && t?.netMonthlyIncome == null) {
      pedir("trabalho_renda", "Informe sua renda mensal (bruta ou líquida).");
    }
  }

  if (sections.includes("entrada_fgts") && payload.entrada_fgts?.downPaymentAmount == null) {
    pedir("entrada_fgts", "Informe o valor de entrada (pode ser zero).");
  }

  return pendencias;
}

// ---------------------------------------------------------------------------
// Lado público (o cliente, pelo link /f/:token)
// ---------------------------------------------------------------------------

/** Código de acesso: 6 dígitos, chega por e-mail. */
export const financingVerifyCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "O código tem 6 números."),
});
export type FinancingVerifyCodeDto = z.infer<typeof financingVerifyCodeSchema>;

export const financingSaveSectionSchema = z.object({
  section: z.enum(FINANCING_SECTIONS),
  /** Validado no backend contra o schema da seção; aqui é só o envelope. */
  data: z.unknown(),
  completed: z.boolean().optional(),
});
export type FinancingSaveSectionDto = z.infer<typeof financingSaveSectionSchema>;

/**
 * Estado mínimo do link, antes de qualquer identidade confirmada. Não carrega
 * NENHUM dado pessoal além do primeiro nome (que o próprio destinatário é) e
 * uma dica mascarada de para onde o código vai.
 */
export interface FinancingPublicState {
  state: "aguardando_codigo" | "expirada" | "revogada" | "encerrada";
  leadFirstName: string;
  brokerName: string;
  /** E-mail mascarado (ex.: m•••@t•••.dev) para o cliente saber onde olhar. */
  emailHint: string | null;
  sections: FinancingSection[];
  message: string | null;
  expiresAt: string | null;
}

/** O formulário do cliente, entregue só com a sessão aberta. */
export interface FinancingPublicForm {
  leadFirstName: string;
  leadFullName: string;
  brokerName: string;
  sections: FinancingSection[];
  message: string | null;
  expiresAt: string | null;
  payload: FinancingPayload;
  completedSections: FinancingSection[];
  /** Presentes quando o corretor pediu correção: o que ajustar e por quê. */
  correctionNote: string | null;
  correctionFields: FinancingSection[] | null;
}

/** Resposta do envio do cliente: a versão congelada e quando foi. */
export interface FinancingSubmitResult {
  version: number;
  submittedAt: string;
  brokerName: string;
}

// ---------------------------------------------------------------------------
// Revisão do corretor (Fatia E)
// ---------------------------------------------------------------------------

export const financingRequestCorrectionSchema = z.object({
  /** Blocos que o cliente deve revisar. */
  sections: z
    .array(z.enum(FINANCING_SECTIONS))
    .min(1, "Escolha pelo menos um bloco para corrigir.")
    .transform((v) => [...new Set(v)]),
  note: z
    .string()
    .trim()
    .min(5, "Explique para o cliente o que precisa ser ajustado.")
    .max(500),
  expiresInDays: z
    .number()
    .refine((v): v is FinancingExpiryDays => FINANCING_EXPIRY_OPTIONS.includes(v as FinancingExpiryDays), {
      message: "Prazo inválido.",
    })
    .optional(),
});
export type FinancingRequestCorrectionDto = z.infer<typeof financingRequestCorrectionSchema>;

/** Uma versão enviada pelo cliente, para o histórico da revisão. */
export interface FinancingSubmissionSummary {
  version: number;
  submittedAt: string;
  correctionNote: string | null;
  correctionFields: FinancingSection[] | null;
}

/** A revisão: a solicitação, a última resposta congelada e o histórico. */
export interface FinancingReviewView {
  request: FinancingRequestView;
  payload: FinancingPayload;
  version: number;
  submittedAt: string;
  versions: FinancingSubmissionSummary[];
}

/** O que a aprovação aplicou à ficha, para o corretor ver o efeito. */
export interface FinancingApproveResult {
  request: FinancingRequestView;
  /** Campos de perfil e financeiro efetivamente preenchidos/atualizados. */
  updatedFields: number;
  /** Participantes novos criados na ficha. */
  createdParticipants: number;
  /** Id da simulação pré-preenchida. */
  simulationId: string;
}

// ---------------------------------------------------------------------------
// Views (respostas da API para o corretor)
// ---------------------------------------------------------------------------

export interface FinancingRequestSummary {
  id: string;
  code: number;
  status: FinancingRequestStatus;
  leadId: string;
  propertyId: string | null;
  propertyTitle: string | null;
  sections: FinancingSection[];
  message: string | null;
  expiresInDays: FinancingExpiryDays | null;
  expiresAt: string | null;
  firstOpenedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingRequestView extends FinancingRequestSummary {
  leadName: string;
  leadEmail: string | null;
  reviewedAt: string | null;
  revokedAt: string | null;
  archivedAt: string | null;
  startedAt: string | null;
}

/** Resposta do envio: o link completo aparece UMA vez, nunca mais. */
export interface FinancingSendResult {
  request: FinancingRequestView;
  /** Caminho público com o token em claro (ex.: /f/8Kn7Pm4X...). */
  publicPath: string;
  /** Link wa.me pronto com a mensagem para o cliente. */
  whatsappUrl: string | null;
}
