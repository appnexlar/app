import { z } from "zod";

/**
 * Gestão de usuários no Nexlar Admin (docs/10, Fase 3).
 *
 * Estes DTOs carregam dados DO CORRETOR e da conta dele, nunca das leads e
 * dos clientes que ele atende: o Admin acompanha contas, não carteiras. O
 * uso aparece só como contagem agregada (princípio da finalidade, LGPD).
 */

/** Status reais do banco. "pendente_verificacao" NÃO está aqui de propósito:
 *  é derivado de emailVerified, nunca gravado (docs/10, D3). */
export const BROKER_ACCOUNT_STATUSES = ["ativo", "suspenso", "bloqueado", "desativado"] as const;
export type BrokerAccountStatus = (typeof BROKER_ACCOUNT_STATUSES)[number];

export const BROKER_STATUS_LABELS: Record<BrokerAccountStatus, string> = {
  ativo: "Ativa",
  suspenso: "Suspensa",
  bloqueado: "Bloqueada",
  desativado: "Desativada",
};

/** Filtro da lista: os status reais mais o derivado. */
export const USER_LIST_STATUS_FILTERS = [
  "todos",
  "ativo",
  "pendente_verificacao",
  "suspenso",
  "bloqueado",
  "desativado",
] as const;

export const adminListUsersQuerySchema = z.object({
  /** Busca em nome, e-mail e telefone, sem diferenciar maiúsculas. */
  busca: z.string().trim().max(120).optional(),
  status: z.enum(USER_LIST_STATUS_FILTERS).default("todos"),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

export interface AdminBrokerSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  agencyName: string | null;
  status: BrokerAccountStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersPage {
  items: AdminBrokerSummary[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Contagens agregadas de uso. Números, nunca os registros em si. */
export interface AdminBrokerUsage {
  leads: number;
  clientes: number;
  imoveis: number;
  selecoes: number;
  visitas: number;
  agendamentos: number;
}

export interface AdminBrokerProfile extends AdminBrokerSummary {
  /** Motivo interno da suspensão; visível só no Admin. */
  suspendedReason: string | null;
  suspendedAt: string | null;
  /** Conta social vinculada (sem expor o identificador em si). */
  hasGoogle: boolean;
  /** Consegue entrar por senha (conta só-Google não tem hash). */
  hasPassword: boolean;
  onboardingCompleto: boolean;
  termsAcceptedAt: string | null;
  /** Leitura, nunca gestão: o fluxo de CRECI ficou fora desta fase. */
  creci: { numero: string | null; uf: string | null; status: string } | null;
  usage: AdminBrokerUsage;
}

export const suspendBrokerSchema = z.object({
  reason: z.string().trim().min(5, "Descreva o motivo").max(500),
});
export type SuspendBrokerDto = z.infer<typeof suspendBrokerSchema>;
