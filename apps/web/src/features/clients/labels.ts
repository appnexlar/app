import type {
  ClientPurpose,
  ConversionNextStep,
  ConversionReason,
  DeletionStatus,
  IncomeType,
  MaritalStatus,
  ParticipantRelation,
  PaymentMethod,
} from "@nexlar/shared";

export const REASON_LABELS: Record<ConversionReason, string> = {
  cliente_da_carteira: "Já era cliente da carteira",
  inicio_financiamento: "Início de financiamento",
  solicitacao_documentos: "Solicitação de documentos",
  analise_cadastral: "Análise cadastral",
  preparacao_proposta: "Preparação de proposta",
  negociacao_formal: "Negociação formal",
  processo_locacao: "Processo de locação",
  outro: "Outro",
};

export const NEXT_STEP_LABELS: Record<ConversionNextStep, string> = {
  coletar_dados: "Coletar dados pessoais",
  solicitar_documentos: "Solicitar documentos",
  registrar_simulacao: "Registrar simulação",
  preparar_proposta: "Preparar proposta",
  iniciar_analise_cadastral: "Iniciar análise cadastral",
  iniciar_negociacao: "Iniciar negociação",
};

/** Etapa real do atendimento, derivada da próxima etapa combinada na conversão. */
export const STAGE_LABELS: Record<ConversionNextStep, string> = {
  coletar_dados: "Coleta de dados",
  solicitar_documentos: "Documentação",
  registrar_simulacao: "Simulação",
  preparar_proposta: "Proposta",
  iniciar_analise_cadastral: "Análise financeira",
  iniciar_negociacao: "Negociação",
};

/** Ação sugerida ao corretor, com base na etapa combinada. Orienta o próximo passo. */
export const SUGGESTED_ACTION_LABELS: Record<ConversionNextStep, string> = {
  coletar_dados: "Solicitar dados pessoais",
  solicitar_documentos: "Enviar checklist de documentos",
  registrar_simulacao: "Registrar simulação",
  preparar_proposta: "Preparar proposta",
  iniciar_analise_cadastral: "Iniciar análise financeira",
  iniciar_negociacao: "Iniciar negociação",
};

export const PURPOSE_LABELS: Record<ClientPurpose, string> = {
  compra: "Compra",
  locacao: "Locação",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function displayDate(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : "Não informado";
}

export function displayDateTime(iso: string | null): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "Não informado";
}

export const MARITAL_LABELS: Record<MaritalStatus, string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao_estavel: "União estável",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
  outro: "Outro",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  a_vista: "À vista",
  financiamento: "Financiamento",
  fgts_mais_financiamento: "FGTS + financiamento",
  permuta: "Permuta",
  outro: "Outro",
};

/** CPF em 000.000.000-00 a partir dos 11 dígitos armazenados. */
export function formatCpf(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return cpf ?? "Não informado";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function formatCep(cep: string | null): string | null {
  if (!cep || cep.length !== 8) return cep;
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}

const moneyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatMoney(value: number | null): string {
  return value != null ? moneyFmt.format(value) : "Não informado";
}

/** Data AAAA-MM-DD exibida como data brasileira, sem fuso. */
export function displayDateOnly(iso: string | null): string {
  if (!iso) return "Não informado";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const INCOME_LABELS: Record<IncomeType, string> = {
  assalariado: "Assalariado(a)",
  autonomo: "Autônomo(a)",
  empresario: "Empresário(a)",
  aposentado: "Aposentado(a)",
  profissional_liberal: "Profissional liberal",
  outro: "Outro",
};

export const RELATION_LABELS: Record<ParticipantRelation, string> = {
  conjuge: "Cônjuge",
  comprador_conjunto: "Comprador conjunto",
  locatario_conjunto: "Locatário conjunto",
  fiador: "Fiador(a)",
  dependente: "Dependente",
  procurador: "Procurador(a)",
  outro: "Outro",
};

export const DELETION_STATUS_LABELS: Record<DeletionStatus, string> = {
  solicitada: "Solicitada",
  em_analise: "Em análise",
  concluida: "Concluída",
  negada: "Negada",
};

/** Mascara o CPF em contexto não operacional: ***.***.***-12. */
export function maskCpf(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return cpf ?? "Não informado";
  return `***.***.***-${cpf.slice(9)}`;
}

export function boolLabel(v: boolean | null): string {
  return v == null ? "Não informado" : v ? "Sim" : "Não";
}
