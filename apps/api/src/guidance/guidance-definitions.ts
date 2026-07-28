import type {
  DismissPolicy,
  GuidanceCategory,
  ProductEventType,
} from "@nexlar/shared";
import type { GuidanceContext } from "./guidance-context";

/**
 * Definição de uma orientação. O catálogo vive em código (o prompt permite,
 * §21) porque não há edição administrativa: mudar uma regra é mudar o produto,
 * e isso passa por deploy, não por painel.
 *
 * A regra de elegibilidade é uma função pura do contexto. Nunca consulta banco
 * nem interface: é o que mantém o motor testável e o front burro (§23, GUI-01).
 */
export interface GuidanceDefinition {
  key: string;
  category: GuidanceCategory;
  /** Maior = mais importante dentro da mesma categoria. */
  priority: number;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl?: string;
  actionType?: string;
  dismissible: boolean;
  dismissPolicy: DismissPolicy;
  /** True quando a orientação está elegível para este contexto (GUI-01). */
  eligible: (ctx: GuidanceContext) => boolean;
  /**
   * Evento real que conclui a orientação (GUI-04). Quando presente, o serviço
   * marca `completed` ao vê-lo. Nem toda orientação operacional tem um: a
   * conclusão delas é a própria condição deixar de valer (vira `expired`).
   */
  completionEvent?: ProductEventType;
}

/**
 * Catálogo. A ordem aqui não importa para a prioridade (isso é `category` +
 * `priority`), mas ajuda a ler a jornada de cima para baixo, na sequência
 * natural do corretor (§30).
 */
export const GUIDANCE_DEFINITIONS: GuidanceDefinition[] = [
  // --- Educacional: a espinha da jornada (§11, §30) --------------------------
  {
    key: "completar-perfil",
    category: "educational",
    priority: 90,
    title: "Complete seu perfil profissional",
    description:
      "Um perfil completo passa mais confiança para seus clientes e prepara o selo de corretor verificado.",
    actionLabel: "Completar perfil",
    actionUrl: "/perfil",
    dismissible: true,
    dismissPolicy: "nunca_reapresentar",
    eligible: (ctx) => !ctx.profileComplete,
    completionEvent: "PROFILE_COMPLETED",
  },
  {
    key: "cadastrar-primeiro-lead",
    category: "educational",
    priority: 100, // o primeiro passo de todos: prioridade máxima quando cabe
    title: "Cadastre seu primeiro lead",
    description:
      "Seus leads são as pessoas interessadas nos seus imóveis. Comece organizando o primeiro atendimento.",
    actionLabel: "Cadastrar primeiro lead",
    actionType: "abrir-novo-lead",
    actionUrl: "/leads",
    dismissible: false, // é o coração do produto; não some
    dismissPolicy: "sempre",
    eligible: (ctx) => ctx.leadCount === 0,
    completionEvent: "FIRST_LEAD_CREATED",
  },
  {
    key: "adicionar-preferencias-lead",
    category: "educational",
    priority: 80,
    title: "Adicione as preferências de um lead",
    description:
      "Com região, intenção e faixa de preço, a Nexlar ajuda a encontrar imóveis mais compatíveis.",
    actionLabel: "Ver leads",
    actionUrl: "/leads",
    dismissible: true,
    dismissPolicy: "reapresentar_se_relevante",
    eligible: (ctx) => ctx.leadCount > 0 && ctx.leadsSemPreferencias > 0,
    completionEvent: "LEAD_PREFERENCES_ADDED",
  },
  {
    key: "cadastrar-primeiro-imovel",
    category: "educational",
    priority: 75,
    title: "Cadastre seu primeiro imóvel",
    description:
      "Com imóveis na sua carteira, você começa a relacioná-los aos leads certos.",
    actionLabel: "Cadastrar primeiro imóvel",
    actionUrl: "/imoveis/novo",
    dismissible: true,
    dismissPolicy: "reapresentar_se_relevante",
    eligible: (ctx) => ctx.leadCount > 0 && ctx.propertyCount === 0,
    completionEvent: "FIRST_PROPERTY_CREATED",
  },
  {
    key: "relacionar-imovel-lead",
    category: "educational",
    priority: 70,
    title: "Envie um imóvel para um lead",
    description:
      "Agora você pode selecionar imóveis conforme o perfil do lead e enviar num link exclusivo.",
    actionLabel: "Ver leads",
    actionUrl: "/leads",
    dismissible: true,
    dismissPolicy: "reapresentar_se_relevante",
    eligible: (ctx) => ctx.leadCount > 0 && ctx.propertyCount > 0 && ctx.matchCount === 0,
    completionEvent: "FIRST_PROPERTY_MATCH_CREATED",
  },
  {
    key: "configurar-agenda",
    category: "educational",
    priority: 40,
    title: "Organize sua agenda",
    description:
      "Configure sua disponibilidade para agendar visitas sem conflito de horário.",
    actionLabel: "Abrir agenda",
    actionUrl: "/agenda",
    dismissible: true,
    dismissPolicy: "nunca_reapresentar",
    // Aparece quando já há movimento (links circulando) e a disponibilidade
    // de visitas ainda não foi configurada.
    eligible: (ctx) => ctx.linkCount > 0 && !ctx.calendarConfigured,
    completionEvent: "CALENDAR_CONFIGURED",
  },

  // --- Operacional: o trabalho do dia (§12) ---------------------------------
  {
    key: "follow-up-pendente",
    category: "operational",
    priority: 60,
    title: "Você tem leads esperando um retorno",
    description:
      "Alguns leads estão com a próxima ação vencida. Um contato hoje mantém a conversa viva.",
    actionLabel: "Ver quem contatar",
    actionUrl: "/leads",
    dismissible: true,
    dismissPolicy: "reapresentar_se_relevante",
    eligible: (ctx) => ctx.leadsSemFollowUp > 0,
  },
  {
    key: "negociacao-sem-proxima-acao",
    category: "operational",
    priority: 50,
    title: "Uma negociação está sem próximo passo",
    description:
      "Defina a próxima ação para não perder o ritmo de quem está perto de fechar.",
    actionLabel: "Abrir o funil",
    actionUrl: "/funil",
    dismissible: true,
    dismissPolicy: "reapresentar_se_relevante",
    eligible: (ctx) => ctx.negociacoesSemProximaAcao > 0,
  },
];

/** Busca uma definição pela chave. */
export function findDefinition(key: string): GuidanceDefinition | undefined {
  return GUIDANCE_DEFINITIONS.find((d) => d.key === key);
}

/**
 * Marcos do checklist de primeiros passos (§8), na ordem de exibição. Cada um
 * casa com um evento real e, como reforço, com uma leitura direta do contexto,
 * para funcionar mesmo em contas antigas sem o evento gravado (robustez de
 * GUI-06).
 */
export interface ChecklistMilestone {
  key: string;
  title: string;
  event: ProductEventType;
  derivable: (ctx: GuidanceContext) => boolean;
  /** True quando a conclusão não é detectável ainda (agenda). */
  indisponivel?: boolean;
  /** Rota do front onde o corretor faz este passo. Item pendente vira link. */
  actionUrl?: string;
  /** Ação simbólica que o front interpreta (ex.: abrir modal de novo lead). */
  actionType?: "abrir-novo-lead";
}

export const CHECKLIST_MILESTONES: ChecklistMilestone[] = [
  {
    key: "perfil",
    title: "Completar perfil profissional",
    event: "PROFILE_COMPLETED",
    derivable: (ctx) => ctx.profileComplete,
    actionUrl: "/perfil",
  },
  {
    key: "primeiro-lead",
    title: "Cadastrar primeiro lead",
    event: "FIRST_LEAD_CREATED",
    derivable: (ctx) => ctx.leadCount > 0,
    actionType: "abrir-novo-lead",
    actionUrl: "/leads",
  },
  {
    key: "preferencias",
    title: "Adicionar preferências a um lead",
    event: "LEAD_PREFERENCES_ADDED",
    derivable: (ctx) => ctx.leadCount > 0 && ctx.leadsSemPreferencias < ctx.leadCount,
    actionUrl: "/leads",
  },
  {
    key: "primeiro-imovel",
    title: "Cadastrar primeiro imóvel",
    event: "FIRST_PROPERTY_CREATED",
    derivable: (ctx) => ctx.propertyCount > 0,
    actionUrl: "/imoveis/novo",
  },
  {
    key: "relacionar-imovel",
    title: "Relacionar um imóvel a um lead",
    event: "FIRST_PROPERTY_MATCH_CREATED",
    derivable: (ctx) => ctx.matchCount > 0,
    actionUrl: "/imoveis",
  },
  {
    key: "primeiro-link",
    title: "Gerar o primeiro link personalizado",
    event: "FIRST_PERSONALIZED_LINK_GENERATED",
    derivable: (ctx) => ctx.linkCount > 0,
    actionUrl: "/leads",
  },
  {
    key: "configurar-agenda",
    title: "Configurar a agenda",
    event: "CALENDAR_CONFIGURED",
    derivable: (ctx) => ctx.calendarConfigured,
    actionUrl: "/agenda",
  },
  {
    key: "primeira-visita",
    title: "Agendar a primeira visita",
    event: "FIRST_VISIT_SCHEDULED",
    derivable: (ctx) => ctx.milestones.has("FIRST_VISIT_SCHEDULED"),
    actionUrl: "/agenda",
  },
  {
    key: "primeira-conversao",
    title: "Converter o primeiro lead em cliente",
    event: "FIRST_LEAD_CONVERTED",
    derivable: (ctx) => ctx.milestones.has("FIRST_LEAD_CONVERTED"),
    actionUrl: "/funil",
  },
];
