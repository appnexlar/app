import type { AgendaEventStatus, AgendaEventType, TaskKind } from "@nexlar/shared";

export const TYPE_LABELS: Record<AgendaEventType, string> = {
  tarefa: "Tarefa",
  visita: "Visita",
  compromisso: "Compromisso",
  bloqueio: "Bloqueio",
  google_ocupado: "Ocupado (Google)",
};

export const STATUS_LABELS: Record<AgendaEventStatus, string> = {
  pendente: "Pendente",
  concluida: "Concluída",
  cancelada: "Cancelada",
  agendado: "Agendado",
  solicitada: "Solicitada",
  aguardando_confirmacao: "Aguardando confirmação",
  confirmada: "Confirmada",
  realizada: "Realizada",
  remarcada: "Remarcada",
  nao_compareceu: "Não compareceu",
  aguardando_feedback: "Aguardando feedback",
};

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  primeiro_contato: "Primeiro contato",
  retorno: "Retorno",
  enviar_imoveis: "Enviar imóveis",
  solicitar_informacao: "Solicitar informação",
  confirmar_visita: "Confirmar visita",
  acompanhar_interesse: "Acompanhar interesse",
  acompanhar_proposta: "Acompanhar proposta",
  outro: "Outro",
};

/** Tom visual por tipo, usado no ponto/etiqueta do evento (não só cor). */
export interface TypeStyle {
  dot: string;
  chipBg: string;
  chipText: string;
  softBg: string;
}

export const TYPE_STYLE: Record<AgendaEventType, TypeStyle> = {
  tarefa: {
    dot: "bg-[var(--accent)]",
    chipBg: "bg-[var(--accent-soft)]",
    chipText: "text-[var(--accent-active)]",
    softBg: "bg-[var(--accent-soft)]",
  },
  compromisso: {
    dot: "bg-[var(--primary)]",
    chipBg: "bg-[var(--primary-soft)]",
    chipText: "text-[var(--primary)]",
    softBg: "bg-[var(--primary-soft)]",
  },
  visita: {
    dot: "bg-[var(--success)]",
    chipBg: "bg-[var(--success-soft)]",
    chipText: "text-[var(--success-fg)]",
    softBg: "bg-[var(--success-soft)]",
  },
  bloqueio: {
    dot: "bg-[var(--text-subtle)]",
    chipBg: "bg-surface-sunken",
    chipText: "text-text-muted",
    softBg: "bg-surface-sunken",
  },
  google_ocupado: {
    dot: "bg-[var(--text-subtle)]",
    chipBg: "bg-surface-sunken",
    chipText: "text-text-muted",
    softBg: "bg-surface-sunken",
  },
};

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

/** Data (AAAA-MM-DD) no fuso local, para preencher inputs type=date. */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hora (HH:MM) no fuso local, para preencher inputs type=time. */
export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/** Combina data + hora local em ISO (UTC) para enviar à API. */
export function toIso(date: string, time?: string): string {
  const iso = time ? `${date}T${time}:00` : `${date}T00:00:00`;
  return new Date(iso).toISOString();
}
