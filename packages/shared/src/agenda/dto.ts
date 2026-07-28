import { z } from "zod";

/**
 * DTOs da Agenda. Um evento unificado (docs/02) reúne tarefa, visita,
 * compromisso geral, bloqueio de horário e "ocupado" do Google. Nesta fase
 * (sub-fatia A) só tarefa e compromisso são criados pela tela; os demais tipos
 * e o ciclo de status da visita já existem no vocabulário para a sub-fatia B.
 * Datas trafegam sempre em ISO 8601 (UTC); o banco guarda em UTC.
 */

export const AGENDA_EVENT_TYPES = [
  "tarefa",
  "visita",
  "compromisso",
  "bloqueio",
  "google_ocupado",
] as const;
export type AgendaEventType = (typeof AGENDA_EVENT_TYPES)[number];

/** Tipos que o corretor cria manualmente nesta fase. */
export const AGENDA_CREATABLE_TYPES = ["tarefa", "compromisso"] as const;

export const AGENDA_EVENT_SOURCES = ["nexlar", "google"] as const;
export type AgendaEventSource = (typeof AGENDA_EVENT_SOURCES)[number];

export const AGENDA_SYNC_STATUSES = [
  "nao_sincronizado",
  "pendente",
  "sincronizado",
  "alterado",
  "erro",
  "desconectado",
] as const;
export type AgendaSyncStatus = (typeof AGENDA_SYNC_STATUSES)[number];

export const AGENDA_EVENT_STATUSES = [
  "pendente",
  "concluida",
  "cancelada",
  "agendado",
  "solicitada",
  "aguardando_confirmacao",
  "confirmada",
  "realizada",
  "remarcada",
  "nao_compareceu",
  "aguardando_feedback",
] as const;
export type AgendaEventStatus = (typeof AGENDA_EVENT_STATUSES)[number];

/** Naturezas de tarefa sugeridas no cadastro. */
export const TASK_KINDS = [
  "primeiro_contato",
  "retorno",
  "enviar_imoveis",
  "solicitar_informacao",
  "confirmar_visita",
  "acompanhar_interesse",
  "acompanhar_proposta",
  "outro",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Resumo de um evento da agenda (payload de listagem e detalhe). */
export interface AgendaEventSummary {
  id: string;
  type: AgendaEventType;
  leadId: string | null;
  leadName: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  title: string;
  description: string | null;
  location: string | null;
  /** Início em ISO 8601 (UTC). */
  startAt: string;
  /** Fim em ISO 8601 (UTC); nulo em tarefa sem duração. */
  endAt: string | null;
  allDay: boolean;
  status: AgendaEventStatus;
  taskKind: TaskKind | null;
  reminderMinutes: number | null;
  source: AgendaEventSource;
  syncStatus: AgendaSyncStatus;
  createdAt: string;
  updatedAt: string;
}

/** Contadores do resumo operacional (indicadores clicáveis). */
export interface AgendaSummary {
  overdueTasks: number;
  todayTasks: number;
  todayVisits: number;
  pendingVisitRequests: number;
}

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

const isoDateTime = z.string().datetime({ offset: true });

/**
 * Criação de evento (tarefa ou compromisso). Regras de horário são revalidadas
 * na API. Obrigatórios: título e início. Compromisso exige horário final.
 */
export const createAgendaEventSchema = z
  .object({
    type: z.enum(AGENDA_CREATABLE_TYPES),
    title: z.string().trim().min(1, "Informe o título").max(200),
    description: optionalTrimmed(2000),
    startAt: isoDateTime,
    endAt: isoDateTime.optional(),
    allDay: z.boolean().optional().default(false),
    reminderMinutes: z.number().int().min(0).max(40320).optional(),
    leadId: z.string().uuid().optional(),
    propertyId: z.string().uuid().optional(),
    location: optionalTrimmed(300),
    taskKind: z.enum(TASK_KINDS).optional(),
    /** Ignora conflito de horário e cria mesmo assim. */
    force: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "compromisso") {
      if (data.allDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allDay"],
          message: "Compromisso precisa de horário.",
        });
      }
      if (!data.endAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endAt"],
          message: "Informe o horário final.",
        });
      }
    }
    if (data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "O fim precisa ser depois do início.",
      });
    }
  });
export type CreateAgendaEventDto = z.infer<typeof createAgendaEventSchema>;

/**
 * Atualização parcial: editar, reagendar (startAt/endAt), concluir/cancelar
 * (status) ou trocar o vínculo com lead/imóvel. Tudo opcional.
 */
export const updateAgendaEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: optionalTrimmed(2000),
    startAt: isoDateTime.optional(),
    endAt: isoDateTime.nullable().optional(),
    allDay: z.boolean().optional(),
    reminderMinutes: z.number().int().min(0).max(40320).nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    propertyId: z.string().uuid().nullable().optional(),
    location: optionalTrimmed(300),
    taskKind: z.enum(TASK_KINDS).nullable().optional(),
    status: z.enum(AGENDA_EVENT_STATUSES).optional(),
    force: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "O fim precisa ser depois do início.",
      });
    }
  });
export type UpdateAgendaEventDto = z.infer<typeof updateAgendaEventSchema>;

const boolFromQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

/** Filtros de listagem da agenda (todos opcionais), vindos da query string. */
export const listAgendaSchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  type: z.enum(AGENDA_EVENT_TYPES).optional(),
  leadId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  status: z.enum(AGENDA_EVENT_STATUSES).optional(),
  source: z.enum(AGENDA_EVENT_SOURCES).optional(),
  overdue: boolFromQuery,
  done: boolFromQuery,
});
export type AgendaListQuery = z.infer<typeof listAgendaSchema>;

// ---------------------------------------------------------------------------
// Disponibilidade de visitas (Seleção Personalizada, Fatia 4)
// ---------------------------------------------------------------------------

/** "HH:MM" em 24h. */
const horaMinuto = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");

/** Uma janela semanal em que o corretor aceita visitas. weekday: 0=domingo. */
export const availabilityWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: horaMinuto,
    end: horaMinuto,
  })
  .refine((w) => w.start < w.end, { message: "O início precisa vir antes do fim" });
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

/**
 * Configuração de visitas do corretor. Sem janelas = agenda não configurada:
 * a página da lead cai no fallback de solicitação (nunca inventamos horário).
 */
export const upsertVisitAvailabilitySchema = z.object({
  windows: z.array(availabilityWindowSchema).max(21),
  slotDurationMin: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  minNoticeHours: z.number().int().min(0).max(72),
  maxAdvanceDays: z.number().int().min(1).max(60),
});
export type UpsertVisitAvailabilityDto = z.infer<typeof upsertVisitAvailabilitySchema>;

export interface VisitAvailabilityView {
  windows: AvailabilityWindow[];
  slotDurationMin: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  /** Tem ao menos uma janela: a lead verá horários reais. */
  configured: boolean;
}
