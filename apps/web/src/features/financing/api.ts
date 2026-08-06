import type {
  CreateFinancingRequestDto,
  FinancingApproveResult,
  FinancingRequestCorrectionDto,
  FinancingRequestSummary,
  FinancingRequestView,
  FinancingReviewView,
  FinancingSendResult,
  UpdateFinancingRequestDto,
} from "@nexlar/shared";
import { http } from "../../lib/http";

/** Coleta de dados para simulação de financiamento (docs/09), lado do corretor. */

export function createFinancingRequest(dto: CreateFinancingRequestDto): Promise<FinancingRequestView> {
  return http.post<FinancingRequestView>("/financing-requests", dto);
}

export function fetchLeadFinancingRequests(leadId: string): Promise<FinancingRequestSummary[]> {
  return http.get<FinancingRequestSummary[]>(`/financing-requests?leadId=${leadId}`);
}

export function fetchFinancingRequest(ref: string | number): Promise<FinancingRequestView> {
  return http.get<FinancingRequestView>(`/financing-requests/${ref}`);
}

export function updateFinancingRequest(
  ref: string | number,
  dto: UpdateFinancingRequestDto,
): Promise<FinancingRequestView> {
  return http.patch<FinancingRequestView>(`/financing-requests/${ref}`, dto);
}

/** O token do link só existe nesta resposta. Depois, nunca mais. */
export function sendFinancingRequest(ref: string | number): Promise<FinancingSendResult> {
  return http.post<FinancingSendResult>(`/financing-requests/${ref}/send`, {});
}

export function revokeFinancingRequest(ref: string | number): Promise<FinancingRequestView> {
  return http.post<FinancingRequestView>(`/financing-requests/${ref}/revoke`, {});
}

export function archiveFinancingRequest(ref: string | number): Promise<FinancingRequestView> {
  return http.post<FinancingRequestView>(`/financing-requests/${ref}/archive`, {});
}

/** As respostas do cliente. Abrir a revisão marca em_revisao no backend. */
export function fetchFinancingReview(ref: string | number): Promise<FinancingReviewView> {
  return http.get<FinancingReviewView>(`/financing-requests/${ref}/review`);
}

export function requestFinancingCorrection(
  ref: string | number,
  dto: FinancingRequestCorrectionDto,
): Promise<FinancingSendResult> {
  return http.post<FinancingSendResult>(`/financing-requests/${ref}/request-correction`, dto);
}

export function approveFinancing(ref: string | number): Promise<FinancingApproveResult> {
  return http.post<FinancingApproveResult>(`/financing-requests/${ref}/approve`, {});
}
