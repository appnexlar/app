import type {
  ClientDetail,
  ClientFinancialData,
  ClientNegotiationData,
  ClientProfileData,
  ClientSummary,
  ConvertLeadDto,
  CreateClientDto,
  DeletionRequestSummary,
  LeadSummary,
  ListClientsQuery,
  ParticipantSummary,
  RequestDeletionDto,
  UpdateClientFinancialDto,
  UpdateClientNegotiationDto,
  UpdateClientProfileDto,
  UpsertParticipantDto,
} from "@nexlar/shared";
import { http } from "../../lib/http";

function toQuery(q: ListClientsQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.purpose) p.set("purpose", q.purpose);
  if (q.hasRelatedProperty != null) p.set("hasRelatedProperty", String(q.hasRelatedProperty));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function createClient(dto: CreateClientDto): Promise<ClientSummary> {
  return http.post<ClientSummary>("/clients", dto);
}

export function fetchClients(query: ListClientsQuery): Promise<ClientSummary[]> {
  return http.get<ClientSummary[]>(`/clients${toQuery(query)}`);
}

export function fetchClient(id: string): Promise<ClientDetail> {
  return http.get<ClientDetail>(`/clients/${id}`);
}

export function convertLead(leadId: string, dto: ConvertLeadDto): Promise<LeadSummary> {
  return http.post<LeadSummary>(`/leads/${leadId}/convert`, dto);
}

export function updateClientProfile(
  id: string,
  dto: UpdateClientProfileDto,
): Promise<ClientProfileData> {
  return http.patch<ClientProfileData>(`/clients/${id}/profile`, dto);
}

export function updateClientNegotiation(
  id: string,
  dto: UpdateClientNegotiationDto,
): Promise<ClientNegotiationData> {
  return http.patch<ClientNegotiationData>(`/clients/${id}/negotiation`, dto);
}

export function updateClientFinancial(
  id: string,
  dto: UpdateClientFinancialDto,
): Promise<ClientFinancialData> {
  return http.patch<ClientFinancialData>(`/clients/${id}/financial`, dto);
}

export function addParticipant(id: string, dto: UpsertParticipantDto): Promise<ParticipantSummary> {
  return http.post<ParticipantSummary>(`/clients/${id}/participants`, dto);
}

export function updateParticipant(
  id: string,
  participantId: string,
  dto: UpsertParticipantDto,
): Promise<ParticipantSummary> {
  return http.patch<ParticipantSummary>(`/clients/${id}/participants/${participantId}`, dto);
}

export function removeParticipant(id: string, participantId: string): Promise<void> {
  return http.delete<void>(`/clients/${id}/participants/${participantId}`);
}

export function requestDeletion(id: string, dto: RequestDeletionDto): Promise<DeletionRequestSummary> {
  return http.post<DeletionRequestSummary>(`/clients/${id}/deletion-request`, dto);
}
