import type {
  ChangeLeadStatusDto,
  ClientDetail,
  CreateLeadDto,
  LeadStatus,
  LeadSummary,
} from "@nexlar/shared";
import { ApiError, http } from "../../lib/http";

/**
 * Entidade única (set 2026): a lista, a ficha, o cadastro e a etapa falam com
 * /clients, que serve todo mundo. A exclusão e os sub-recursos (preferências,
 * seleções, imóveis enviados) seguem nos caminhos antigos, que a API mantém
 * como apelidos até a limpeza final.
 */
export function fetchLeads(): Promise<LeadSummary[]> {
  return http.get<LeadSummary[]>("/clients");
}

export function fetchLead(id: string): Promise<ClientDetail> {
  return http.get<ClientDetail>(`/clients/${id}`);
}

export function createLead(
  dto: CreateLeadDto & { status?: LeadStatus; consent?: boolean },
): Promise<LeadSummary> {
  return http.post<LeadSummary>("/clients", dto);
}

export function changeLeadStatus(
  id: string,
  status: LeadStatus,
  extra?: { lostReason?: string; reactivateAt?: string; purpose?: "compra" | "locacao"; closeNote?: string },
): Promise<LeadSummary> {
  const dto: ChangeLeadStatusDto = { status, ...extra };
  return http.patch<LeadSummary>(`/clients/${id}/status`, dto);
}

export function deleteLead(id: string): Promise<void> {
  return http.delete<void>(`/clients/${id}`);
}

/** Extrai o lead existente de um 409 de WhatsApp duplicado. */
export function duplicateLeadFrom(error: unknown): LeadSummary | null {
  if (error instanceof ApiError && error.status === 409 && error.details) {
    return (error.details.existingLead as LeadSummary | undefined) ?? null;
  }
  return null;
}
