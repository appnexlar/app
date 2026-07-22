import type {
  AgendaEventSummary,
  AgendaListQuery,
  AgendaSummary,
  CreateAgendaEventDto,
  UpdateAgendaEventDto,
} from "@nexlar/shared";
import { ApiError, http } from "../../lib/http";

function toQuery(q: AgendaListQuery): string {
  const p = new URLSearchParams();
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.type) p.set("type", q.type);
  if (q.leadId) p.set("leadId", q.leadId);
  if (q.propertyId) p.set("propertyId", q.propertyId);
  if (q.status) p.set("status", q.status);
  if (q.source) p.set("source", q.source);
  if (q.overdue != null) p.set("overdue", String(q.overdue));
  if (q.done != null) p.set("done", String(q.done));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function fetchAgenda(query: AgendaListQuery): Promise<AgendaEventSummary[]> {
  return http.get<AgendaEventSummary[]>(`/agenda${toQuery(query)}`);
}

export function fetchAgendaSummary(): Promise<AgendaSummary> {
  return http.get<AgendaSummary>("/agenda/summary");
}

export function createAgendaEvent(dto: CreateAgendaEventDto): Promise<AgendaEventSummary> {
  return http.post<AgendaEventSummary>("/agenda", dto);
}

export function updateAgendaEvent(
  id: string,
  dto: UpdateAgendaEventDto,
): Promise<AgendaEventSummary> {
  return http.patch<AgendaEventSummary>(`/agenda/${id}`, dto);
}

export function deleteAgendaEvent(id: string): Promise<void> {
  return http.delete<void>(`/agenda/${id}`);
}

/** Extrai os eventos em conflito de um 409 de horário ocupado. */
export function conflictsFrom(error: unknown): AgendaEventSummary[] | null {
  if (error instanceof ApiError && error.status === 409 && error.details) {
    return (error.details.conflicts as AgendaEventSummary[] | undefined) ?? null;
  }
  return null;
}
