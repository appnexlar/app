import { z } from "zod";
import type { AdminRole } from "./permissions";

/**
 * Trilha administrativa (docs/10, Fase 5).
 *
 * A tabela é escrita desde a Fase 1; esta fase abre a leitura. Duas
 * propriedades da trilha mandam no desenho daqui:
 *
 * 1. Ela sobrevive ao alvo. O `resourceId` não tem chave estrangeira, então
 *    excluir a conta não apaga a prova do que foi feito com ela. Por isso o
 *    nome do alvo vem resolvido quando existe e nulo quando não existe mais,
 *    em vez de a linha sumir.
 * 2. Ela conta a história como foi. O papel gravado é o do ator NO MOMENTO
 *    da ação, não o papel de hoje.
 */

export const ADMIN_AUDIT_RESOURCE_TYPES = ["admin_user", "broker"] as const;
export type AdminAuditResourceType = (typeof ADMIN_AUDIT_RESOURCE_TYPES)[number];

/**
 * O que cada ação significa em português, e o peso que ela tem na leitura.
 *
 * "atencao" não quer dizer que algo deu errado: quer dizer que a linha merece
 * ser lida antes das outras quando a tela está cheia. Tirar acesso de alguém
 * e recusar uma entrada pesam mais que uma entrada comum.
 */
export const ADMIN_AUDIT_ACTIONS = {
  admin_entrou: { label: "Entrou no painel", peso: "rotina" },
  admin_login_recusado: { label: "Entrada recusada", peso: "atencao" },
  admin_criado: { label: "Administrador criado", peso: "atencao" },
  admin_alterado: { label: "Administrador alterado", peso: "atencao" },
  admin_suspenso: { label: "Administrador suspenso", peso: "atencao" },
  admin_google_vinculado: { label: "Conta Google vinculada", peso: "atencao" },
  corretor_suspenso: { label: "Corretor suspenso", peso: "atencao" },
  corretor_reativado: { label: "Corretor reativado", peso: "rotina" },
} as const satisfies Record<string, { label: string; peso: "rotina" | "atencao" }>;

export type AdminAuditAction = keyof typeof ADMIN_AUDIT_ACTIONS;
export const ADMIN_AUDIT_ACTION_LIST = Object.keys(ADMIN_AUDIT_ACTIONS) as AdminAuditAction[];

/**
 * Rótulo de uma ação vinda do banco. A ação é `String` na tabela de
 * propósito, para trilha antiga continuar legível depois de o catálogo
 * mudar: o que não está no catálogo aparece com a própria chave, nunca
 * vazio, e nunca derruba a tela.
 */
export function rotuloDaAcao(action: string): string {
  return (ADMIN_AUDIT_ACTIONS as Record<string, { label: string }>)[action]?.label ?? action;
}

export function pesoDaAcao(action: string): "rotina" | "atencao" {
  return (
    (ADMIN_AUDIT_ACTIONS as Record<string, { peso: "rotina" | "atencao" }>)[action]?.peso ??
    "rotina"
  );
}

export const adminAuditQuerySchema = z.object({
  /** Quem fez. */
  ator: z.string().uuid().optional(),
  acao: z.string().trim().max(60).optional(),
  recurso: z.enum(ADMIN_AUDIT_RESOURCE_TYPES).optional(),
  /** Trilha de um alvo específico, que é o histórico na ficha da conta. */
  recursoId: z.string().trim().max(64).optional(),
  /** Início e fim do recorte, em ISO. O fim entra inteiro no dia informado. */
  de: z.string().datetime().optional(),
  ate: z.string().datetime().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;

export interface AdminAuditActor {
  id: string;
  fullName: string;
  email: string;
  /** Papel no momento da ação, não o de agora. */
  role: AdminRole;
}

export interface AdminAuditEntry {
  id: string;
  createdAt: string;
  action: string;
  actor: AdminAuditActor;
  resourceType: string;
  resourceId: string | null;
  /** Nome do alvo hoje. Nulo quando o alvo não existe mais. */
  resourceLabel: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason: string | null;
}

export interface AdminAuditPage {
  items: AdminAuditEntry[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Administradores que já aparecem na trilha, para o filtro de ator. */
export interface AdminAuditActorOption {
  id: string;
  fullName: string;
}
