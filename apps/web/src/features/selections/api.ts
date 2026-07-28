import type {
  AddSelectionItemDto,
  LeadPreferenceView,
  ReorderSelectionItemsDto,
  SelectionCandidatesResult,
  SelectionSummary,
  SelectionView,
  UpdateSelectionDto,
  UpdateSelectionItemDto,
  UpsertLeadPreferenceDto,
} from "@nexlar/shared";
import { http } from "../../lib/http";

/** Seleção personalizada: montagem, transições e pesquisa de candidatos. */

export function createSelection(leadId: string, propertyIds?: string[]): Promise<SelectionView> {
  return http.post<SelectionView>("/selections", {
    leadId,
    ...(propertyIds && propertyIds.length > 0 ? { propertyIds } : {}),
  });
}

export function fetchSelection(id: string): Promise<SelectionView> {
  return http.get<SelectionView>(`/selections/${id}`);
}

export function fetchLeadSelections(leadId: string): Promise<SelectionSummary[]> {
  return http.get<SelectionSummary[]>(`/leads/${leadId}/selections`);
}

export function updateSelection(id: string, dto: UpdateSelectionDto): Promise<SelectionView> {
  return http.patch<SelectionView>(`/selections/${id}`, dto);
}

export function addSelectionItem(id: string, dto: AddSelectionItemDto): Promise<SelectionView> {
  return http.post<SelectionView>(`/selections/${id}/items`, dto);
}

export function updateSelectionItem(
  id: string,
  itemId: string,
  dto: UpdateSelectionItemDto,
): Promise<SelectionView> {
  return http.patch<SelectionView>(`/selections/${id}/items/${itemId}`, dto);
}

export function reorderSelectionItems(id: string, dto: ReorderSelectionItemsDto): Promise<SelectionView> {
  return http.patch<SelectionView>(`/selections/${id}/items/reorder`, dto);
}

export function removeSelectionItem(id: string, itemId: string): Promise<SelectionView> {
  return http.delete<SelectionView>(`/selections/${id}/items/${itemId}`);
}

export function activateSelection(id: string): Promise<SelectionView> {
  return http.post<SelectionView>(`/selections/${id}/activate`);
}

export function revokeSelection(id: string): Promise<SelectionView> {
  return http.post<SelectionView>(`/selections/${id}/revoke`);
}

export function archiveSelection(id: string): Promise<SelectionView> {
  return http.post<SelectionView>(`/selections/${id}/archive`);
}

export interface CandidateFilters {
  q?: string;
  purpose?: string;
  city?: string;
  neighborhood?: string;
  priceMax?: number;
  bedroomsMin?: number;
  page?: number;
}

export function fetchCandidates(
  id: string,
  filters: CandidateFilters,
): Promise<SelectionCandidatesResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return http.get<SelectionCandidatesResult>(`/selections/${id}/candidates${qs ? `?${qs}` : ""}`);
}

export function fetchLeadPreferences(leadId: string): Promise<LeadPreferenceView | null> {
  return http.get<LeadPreferenceView | null>(`/leads/${leadId}/preferences`);
}

export function saveLeadPreferences(
  leadId: string,
  dto: UpsertLeadPreferenceDto,
): Promise<LeadPreferenceView> {
  return http.put<LeadPreferenceView>(`/leads/${leadId}/preferences`, dto);
}

/** URL pública da seleção, montada no cliente. */
export function selectionPublicUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}
