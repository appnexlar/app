import type {
  CreateShareDto,
  LeadShareSummary,
  PropertyShareSummary,
  PublicSharedProperty,
  SelectionResponse,
} from "@nexlar/shared";
import { http } from "../../lib/http";

export function createShare(propertyId: string, dto: CreateShareDto): Promise<PropertyShareSummary> {
  return http.post<PropertyShareSummary>(`/properties/${propertyId}/shares`, dto);
}

export function fetchPropertyShares(propertyId: string): Promise<PropertyShareSummary[]> {
  return http.get<PropertyShareSummary[]>(`/properties/${propertyId}/shares`);
}

export function fetchLeadShares(leadId: string): Promise<LeadShareSummary[]> {
  return http.get<LeadShareSummary[]>(`/leads/${leadId}/shares`);
}

export function resendShare(shareId: string): Promise<PropertyShareSummary> {
  return http.post<PropertyShareSummary>(`/shares/${shareId}/resend`);
}

export function revokeShare(shareId: string): Promise<PropertyShareSummary> {
  return http.post<PropertyShareSummary>(`/shares/${shareId}/revoke`);
}

/** Resposta e prioridade são do imóvel (itemId) dentro do compartilhamento. */
export function setShareResponse(
  shareId: string,
  itemId: string,
  response: SelectionResponse,
): Promise<void> {
  return http.post<void>(`/shares/${shareId}/items/${itemId}/response`, { response });
}

export function setSharePriority(shareId: string, itemId: string, isPriority: boolean): Promise<void> {
  return http.post<void>(`/shares/${shareId}/items/${itemId}/priority`, { isPriority });
}

/** Página pública, sem login. */
export function fetchPublicShare(token: string): Promise<PublicSharedProperty> {
  return http.get<PublicSharedProperty>(`/public/shares/${token}`);
}

/** URL pública do imóvel compartilhado, montada no cliente. */
export function publicShareUrl(token: string): string {
  return `${window.location.origin}/imovel-compartilhado/${token}`;
}

/** Só os dígitos do WhatsApp, com DDI 55 quando nacional, para o wa.me. */
export function whatsappDigits(whatsapp: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}
