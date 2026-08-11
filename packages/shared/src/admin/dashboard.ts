import { z } from "zod";
import type { AdminBrokerSummary } from "./users";

/**
 * Dashboard do Nexlar Admin (docs/10, Fase 2).
 *
 * Regra que atravessa este arquivo inteiro: aqui só trafega NÚMERO da
 * plataforma e dado da conta do corretor. Nenhum campo carrega lead, cliente
 * ou qualquer pessoa atendida pelo corretor (finalidade administrativa, LGPD).
 */

export const ADMIN_DASHBOARD_PERIODS = ["hoje", "7d", "30d", "90d"] as const;
export type AdminDashboardPeriod = (typeof ADMIN_DASHBOARD_PERIODS)[number];

export const ADMIN_PERIOD_LABELS: Record<AdminDashboardPeriod, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

export const adminDashboardQuerySchema = z.object({
  periodo: z.enum(ADMIN_DASHBOARD_PERIODS).default("30d"),
});
export type AdminDashboardQuery = z.infer<typeof adminDashboardQuerySchema>;

/**
 * Retrato das contas AGORA. Não depende do período escolhido: é a foto do
 * estado atual da plataforma, e por isso soma sempre o total.
 *
 * "pendentesVerificacao" é derivado de emailVerifiedAt, nunca gravado (D3),
 * e é um recorte de dentro de "ativas": somar os dois contaria a mesma
 * conta duas vezes.
 */
export interface AdminAccountsSnapshot {
  total: number;
  ativas: number;
  pendentesVerificacao: number;
  suspensas: number;
  bloqueadas: number;
  desativadas: number;
}

/**
 * O que se moveu DENTRO do período. Cada número vem com o equivalente do
 * período anterior de mesmo tamanho, para a tela mostrar direção, não só
 * valor: 12 contas novas só quer dizer algo ao lado das 8 do período passado.
 */
export interface AdminMovement {
  novasContas: number;
  novasContasAnterior: number;
  /** Contas distintas que entraram no sistema no período (lastLoginAt). */
  contasAtivas: number;
  contasAtivasAnterior: number;
  /** Cadastros do período que já confirmaram o e-mail. */
  confirmaramEmail: number;
}

/** Uso agregado da plataforma no período. Contagens, jamais registros. */
export interface AdminPlatformUsage {
  leads: number;
  clientes: number;
  imoveis: number;
  selecoes: number;
  visitas: number;
}

/**
 * Alertas: só entra aqui o que tem ação possível HOJE, com tela para resolver.
 * Indicador sem destino é ruído, e ruído no topo do painel treina a pessoa a
 * ignorar o topo do painel.
 *
 * O servidor manda o tipo e a contagem; rótulo e destino são decisão de
 * apresentação e ficam no front.
 */
export const ADMIN_ALERT_KINDS = ["contas_suspensas", "verificacao_parada"] as const;
export type AdminAlertKind = (typeof ADMIN_ALERT_KINDS)[number];

export interface AdminAlert {
  kind: AdminAlertKind;
  count: number;
}

/** Dias que uma conta pode ficar sem confirmar o e-mail antes de virar alerta. */
export const DIAS_PARA_VERIFICACAO_PARADA = 3;

/**
 * Os blocos são anuláveis de propósito: quem não tem `admin.users.view` (o
 * perfil financeiro, por exemplo) recebe `null` no lugar do bloco, em vez de
 * um 403 na tela inicial do painel. A tela explica o que o perfil alcança;
 * o dado simplesmente não sai do servidor.
 */
export interface AdminDashboardSummary {
  periodo: AdminDashboardPeriod;
  contas: AdminAccountsSnapshot | null;
  movimento: AdminMovement | null;
  uso: AdminPlatformUsage | null;
  alertas: AdminAlert[];
  recentes: AdminBrokerSummary[];
}
