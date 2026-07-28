import type {
  PublicBookVisitDto,
  PublicSelectionInfoDto,
  PublicSelectionItemDetailResponse,
  PublicSelectionPageResponse,
  PublicSelectionResponseDto,
  PublicVisitSlotsResponse,
  PublicVisitView,
} from "@nexlar/shared";
import { http } from "../../lib/http";

/** Rotas públicas da seleção: quem chama é a LEAD, sem login. */

export function fetchPublicSelection(token: string): Promise<PublicSelectionPageResponse> {
  return http.get<PublicSelectionPageResponse>(`/public/selecoes/${token}`);
}

export function fetchPublicSelectionItem(
  token: string,
  itemId: string,
): Promise<PublicSelectionItemDetailResponse> {
  return http.get<PublicSelectionItemDetailResponse>(`/public/selecoes/${token}/itens/${itemId}`);
}

export function sendPublicResponse(
  token: string,
  itemId: string,
  dto: PublicSelectionResponseDto,
): Promise<void> {
  return http.post<void>(`/public/selecoes/${token}/itens/${itemId}/resposta`, dto);
}

export function sendPublicInfoRequest(
  token: string,
  itemId: string,
  dto: PublicSelectionInfoDto,
): Promise<void> {
  return http.post<void>(`/public/selecoes/${token}/itens/${itemId}/informacoes`, dto);
}

export function sendPublicVisitRequest(token: string, itemId: string): Promise<void> {
  return http.post<void>(`/public/selecoes/${token}/itens/${itemId}/visita`);
}

export function fetchPublicVisitSlots(
  token: string,
  itemId: string,
): Promise<PublicVisitSlotsResponse> {
  return http.get<PublicVisitSlotsResponse>(`/public/selecoes/${token}/itens/${itemId}/slots`);
}

export function bookPublicVisit(
  token: string,
  itemId: string,
  dto: PublicBookVisitDto,
): Promise<PublicVisitView> {
  return http.post<PublicVisitView>(`/public/selecoes/${token}/itens/${itemId}/agendar`, dto);
}

export function cancelPublicVisit(token: string, itemId: string): Promise<void> {
  return http.post<void>(`/public/selecoes/${token}/itens/${itemId}/visita/cancelar`);
}
