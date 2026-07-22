import type {
  ChangeLeadStatusDto,
  CreateLeadDto,
  LeadDetail,
  LeadStatus,
  LeadSummary,
} from "@nexlar/shared";
import { ApiError, http } from "../../lib/http";

export function fetchLeads(): Promise<LeadSummary[]> {
  return http.get<LeadSummary[]>("/leads");
}

export function fetchLead(id: string): Promise<LeadDetail> {
  return http.get<LeadDetail>(`/leads/${id}`);
}

export function createLead(dto: CreateLeadDto): Promise<LeadSummary> {
  return http.post<LeadSummary>("/leads", dto);
}

export function changeLeadStatus(
  id: string,
  status: LeadStatus,
  extra?: { lostReason?: string; reactivateAt?: string },
): Promise<LeadSummary> {
  const dto: ChangeLeadStatusDto = { status, ...extra };
  return http.patch<LeadSummary>(`/leads/${id}/status`, dto);
}

export function deleteLead(id: string): Promise<void> {
  return http.delete<void>(`/leads/${id}`);
}

/** Extrai o lead existente de um 409 de WhatsApp duplicado. */
export function duplicateLeadFrom(error: unknown): LeadSummary | null {
  if (error instanceof ApiError && error.status === 409 && error.details) {
    return (error.details.existingLead as LeadSummary | undefined) ?? null;
  }
  return null;
}
