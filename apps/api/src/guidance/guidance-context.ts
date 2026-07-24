import type { ProductEventType } from "@nexlar/shared";

/**
 * Retrato do estado da conta num instante, montado a partir do banco. É a
 * única entrada do motor (guidance-engine): o engine é puro e não toca no
 * Prisma, então tudo que ele precisa saber mora aqui. Trocar a fonte dos dados
 * nunca muda a regra.
 */
export interface GuidanceContext {
  brokerId: string;
  now: Date;

  // Perfil
  profileComplete: boolean;

  // Carteira
  leadCount: number;
  leadsSemPreferencias: number;
  propertyCount: number;

  // Relacionamento e compartilhamento
  matchCount: number; // imóveis relacionados a leads (selection_item)
  linkCount: number; // seleções/links gerados (property_selection)

  // Agenda (limitação conhecida: não há modelo de disponibilidade ainda)
  calendarConfigured: boolean;

  // Operacional
  leadsSemFollowUp: number; // próxima ação vencida
  negociacoesSemProximaAcao: number;

  // Marcos já registrados (product_event), para o checklist e a conclusão
  // por evento real (GUI-04).
  milestones: Set<ProductEventType>;
}
