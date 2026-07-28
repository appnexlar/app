/**
 * Jornada 2 — contratos compartilhados da experiência guiada.
 *
 * Este arquivo é a fonte única da verdade dos eventos de produto e dos tipos
 * de recomendação. A API valida contra ele (nada de string solta virar evento)
 * e o front consome os mesmos tipos, então o contrato não desencontra.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Catálogo de eventos de produto (§9 do prompt da Jornada 2)
// ---------------------------------------------------------------------------

/**
 * Todos os eventos que o sistema sabe registrar. A ordem não importa; o que
 * importa é que registrar qualquer coisa fora desta lista é erro (§26:
 * "tentativa de registrar evento inválido" deve ser rejeitada).
 */
export const PRODUCT_EVENTS = [
  "FIRST_LOGIN_COMPLETED",
  "INITIAL_DIAGNOSIS_COMPLETED",
  "INITIAL_DIAGNOSIS_SKIPPED",
  "PROFILE_COMPLETED",
  "FIRST_LEAD_CREATED",
  "FIRST_LEAD_IMPORTED",
  "LEAD_PREFERENCES_ADDED",
  "FIRST_PROPERTY_CREATED",
  "FIRST_PROPERTY_MATCH_CREATED",
  "FIRST_PERSONALIZED_LINK_GENERATED",
  "FIRST_LINK_SENT",
  "FIRST_LINK_VIEWED",
  "FIRST_INTEREST_RECEIVED",
  "CALENDAR_CONFIGURED",
  "FIRST_VISIT_SCHEDULED",
  "FIRST_VISIT_COMPLETED",
  "FIRST_LEAD_CONVERTED",
  "GUIDANCE_SHOWN",
  "GUIDANCE_DISMISSED",
  "GUIDANCE_SKIPPED",
  "GUIDANCE_REOPENED",
  "GUIDANCE_COMPLETED",
  "FEATURE_DISCOVERED",
  // Jornada da Seleção Personalizada. Repetíveis: deduplicação por
  // dedupeKey quando o evento só faz sentido uma vez por entidade.
  "SELECTION_CREATED",
  "SELECTION_ACTIVATED",
  "SELECTION_SENT",
  "SELECTION_OPENED",
  "SELECTION_EXPIRED",
  "SELECTION_REVOKED",
  "SELECTION_PROPERTY_LIKED",
  "SELECTION_PROPERTY_UNLIKED",
  "SELECTION_PROPERTY_DISMISSED",
  "SELECTION_INFORMATION_REQUESTED",
  "SELECTION_VISIT_REQUESTED",
  "SELECTION_VISIT_SCHEDULED",
  "SELECTION_VISIT_CANCELLED",
] as const;

export type ProductEventType = (typeof PRODUCT_EVENTS)[number];

const PRODUCT_EVENT_SET = new Set<string>(PRODUCT_EVENTS);

export function isProductEventType(value: string): value is ProductEventType {
  return PRODUCT_EVENT_SET.has(value);
}

/**
 * Eventos de "primeira vez": um marco que só acontece uma vez por corretor.
 * Para esses, o serviço grava um `dedupeKey` igual ao próprio tipo, e o índice
 * único (broker_id, dedupe_key) garante a idempotência (§27): receber
 * FIRST_LEAD_CREATED dez vezes registra uma linha só e conclui o marco uma vez.
 *
 * Os eventos de fora desta lista são repetíveis por natureza (uma orientação
 * pode ser exibida muitas vezes) e só deduplicam se quem chama pedir um
 * `dedupeKey` explícito (ex.: FEATURE_DISCOVERED por chave de funcionalidade).
 */
export const MILESTONE_EVENTS: readonly ProductEventType[] = [
  "FIRST_LOGIN_COMPLETED",
  "INITIAL_DIAGNOSIS_COMPLETED",
  "INITIAL_DIAGNOSIS_SKIPPED",
  "PROFILE_COMPLETED",
  "FIRST_LEAD_CREATED",
  "FIRST_LEAD_IMPORTED",
  "LEAD_PREFERENCES_ADDED",
  "FIRST_PROPERTY_CREATED",
  "FIRST_PROPERTY_MATCH_CREATED",
  "FIRST_PERSONALIZED_LINK_GENERATED",
  "FIRST_LINK_SENT",
  "FIRST_LINK_VIEWED",
  "FIRST_INTEREST_RECEIVED",
  "CALENDAR_CONFIGURED",
  "FIRST_VISIT_SCHEDULED",
  "FIRST_VISIT_COMPLETED",
  "FIRST_LEAD_CONVERTED",
];

const MILESTONE_EVENT_SET = new Set<string>(MILESTONE_EVENTS);

export function isMilestoneEvent(value: ProductEventType): boolean {
  return MILESTONE_EVENT_SET.has(value);
}

/**
 * Origem da ação que gerou o evento. Ajuda a separar o que o corretor fez de
 * verdade (ui, api) do que o sistema deduziu (system).
 */
export type ProductEventSource = "ui" | "api" | "system";

/** Entrada para registrar um evento. O broker vem sempre do token, na API. */
export interface TrackEventInput {
  type: ProductEventType;
  entityType?: string;
  entityId?: string;
  source?: ProductEventSource;
  /**
   * Chave de deduplicação explícita. Para os MILESTONE_EVENTS o serviço já
   * assume o próprio tipo; passe isto só para deduplicar um evento repetível
   * por uma dimensão (ex.: `feature:tags` num FEATURE_DISCOVERED).
   */
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Recomendações e orientações (§11, §12)
// ---------------------------------------------------------------------------

/**
 * Três níveis, em ordem de prioridade obrigatória (§12): uma educacional nunca
 * substitui visualmente uma crítica ou operacional.
 */
export type GuidanceCategory = "critical" | "operational" | "educational";

/** Como a orientação se comporta depois de dispensada (§16). */
export type DismissPolicy =
  | "nunca_reapresentar" // educacional: fechou, não volta sozinha
  | "reapresentar_se_relevante" // operacional: volta se a condição persistir
  | "sempre"; // crítica: insiste enquanto a condição existir

/**
 * Uma recomendação pronta para a interface. É o contrato que o motor devolve e
 * o front desenha, sem nunca decidir elegibilidade por conta própria (§23).
 */
export interface GuidanceRecommendation {
  key: string;
  type: GuidanceCategory;
  title: string;
  description: string;
  actionLabel: string;
  /** Rota do front, quando a ação é navegar. */
  actionUrl?: string;
  /** Ação simbólica (ex.: abrir modal de novo lead) que o front interpreta. */
  actionType?: string;
  /** Maior = mais importante dentro da mesma categoria. */
  priority: number;
  /** A regra que gerou a recomendação, para transparência (GUI-10). */
  sourceRule: string;
  entityType?: string;
  entityId?: string;
  /** Se pode ser fechada. Crítica obrigatória vem com false. */
  dismissible: boolean;
}

/** Item do checklist de primeiros marcos (§8). Concluído por evento real. */
export interface ChecklistItem {
  key: string;
  title: string;
  done: boolean;
  /** True quando a conclusão ainda não pode ser detectada (ex.: agenda). */
  indisponivel?: boolean;
  /** Rota do front onde o corretor faz este passo, quando pendente. */
  actionUrl?: string;
  /** Ação simbólica (ex.: abrir modal de novo lead) que o front interpreta. */
  actionType?: string;
}

export interface GuidanceChecklist {
  items: ChecklistItem[];
  completed: number;
  total: number;
}

/**
 * Estado da experiência guiada para uma tela. `primary` é a única recomendação
 * em destaque (uma por vez, §11); `secondary` alimenta as ações de menor peso
 * do dashboard adaptativo (§7).
 */
export interface GuidanceState {
  primary: GuidanceRecommendation | null;
  secondary: GuidanceRecommendation[];
  checklist: GuidanceChecklist;
  onboarding: OnboardingStatus;
}

// ---------------------------------------------------------------------------
// Diagnóstico inicial (§5, §6)
// ---------------------------------------------------------------------------

export type WorkMode = "sozinho" | "imobiliaria";
export type BusinessFocus = "venda" | "locacao" | "ambos";

export interface OnboardingStatus {
  /** Falso até o primeiro acesso ser registrado. */
  firstAccessSeen: boolean;
  diagnosisCompleted: boolean;
  diagnosisSkipped: boolean;
  workMode: WorkMode | null;
  businessFocus: BusinessFocus | null;
  hasExistingLeads: boolean | null;
  hasExistingProperties: boolean | null;
  calendarProvider: string | null;
}

export const saveDiagnosisSchema = z.object({
  workMode: z.enum(["sozinho", "imobiliaria"]).optional(),
  businessFocus: z.enum(["venda", "locacao", "ambos"]).optional(),
  hasExistingLeads: z.boolean().optional(),
  hasExistingProperties: z.boolean().optional(),
  calendarProvider: z.string().trim().min(1).max(60).optional(),
  /** Marca que o corretor optou por pular. Exclui `completed`. */
  skipped: z.boolean().optional(),
});

/** Corpo do diagnóstico. Tudo opcional: pode ser pulado ou preenchido em parte. */
export type SaveDiagnosisDto = z.infer<typeof saveDiagnosisSchema>;

// ---------------------------------------------------------------------------
// Central de ajuda contextual (§17)
// ---------------------------------------------------------------------------

/** Um par pergunta/resposta de ajuda. Conteúdo estático, não sensível. */
export interface HelpTopic {
  question: string;
  answer: string;
}

/**
 * Ajuda de uma tela. A primeira versão é conteúdo estático estruturado; a
 * arquitetura já separa por rota para, no futuro, receber busca, vídeos ou um
 * assistente de IA sem mudar o contrato.
 */
export interface HelpContent {
  route: string;
  title: string;
  topics: HelpTopic[];
}
