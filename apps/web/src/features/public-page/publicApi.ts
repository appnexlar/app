import type {
  PublicBrokerPageResponse,
  PublicListingResponse,
  PublicPropertyDetailResponse,
  PublicSort,
  CreateInterestRequest,
  InterestResponse,
} from "@nexlar/shared";
import { http } from "../../lib/http";

/**
 * A vitrine do visitante: fetch direto, sem Authorization, porque a página é
 * aberta e precisa funcionar para quem nunca fez login.
 */
export async function fetchPublicBrokerPage(slug: string): Promise<PublicBrokerPageResponse> {
  const response = await fetch(`/api/public/corretor/${encodeURIComponent(slug)}`);
  if (!response.ok) throw new Error(`Vitrine indisponível (${response.status})`);
  return (await response.json()) as PublicBrokerPageResponse;
}

/** Filtros que a listagem envia. Só entra na URL o que tem valor. */
export interface ListingFilters {
  q?: string;
  purpose?: string;
  type?: string;
  neighborhood?: string;
  sort?: PublicSort;
  page?: number;
}

export async function fetchPublicListing(
  slug: string,
  filtros: ListingFilters,
): Promise<PublicListingResponse> {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== "" && valor !== null) params.set(chave, String(valor));
  }
  const sufixo = params.toString();
  const response = await fetch(
    `/api/public/corretor/${encodeURIComponent(slug)}/imoveis${sufixo ? `?${sufixo}` : ""}`,
  );
  if (!response.ok) throw new Error(`Listagem indisponível (${response.status})`);
  return (await response.json()) as PublicListingResponse;
}

export async function fetchPublicPropertyDetail(
  slug: string,
  code: string,
): Promise<PublicPropertyDetailResponse> {
  const response = await fetch(
    `/api/public/corretor/${encodeURIComponent(slug)}/imoveis/${encodeURIComponent(code)}`,
  );
  if (!response.ok) throw new Error(`Imóvel indisponível (${response.status})`);
  return (await response.json()) as PublicPropertyDetailResponse;
}

/** Prévia do dono: autenticada, dados de agora, sem exigir página ativa. */
export function fetchPreview(): Promise<PublicBrokerPageResponse> {
  return http.get<PublicBrokerPageResponse>("/public-page/me/preview");
}

/** Monta o link de conversa. DDI 55 quando o número vem sem ele. */
export function waLink(digits: string, message: string): string {
  const completo = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${completo}?text=${encodeURIComponent(message)}`;
}

/**
 * Registra o contato da vitrine. Com `code`, é interesse num imóvel; sem
 * `code`, é o pedido de conversa geral do "Chamar no WhatsApp". Nos dois casos
 * o servidor cria (ou reencontra) a lead antes de a conversa começar.
 */
export async function submitInterest(
  slug: string,
  code: number | undefined,
  interest: CreateInterestRequest,
): Promise<InterestResponse> {
  const base = `/api/public/corretor/${encodeURIComponent(slug)}`;
  const url = code === undefined ? `${base}/contato` : `${base}/imoveis/${code}/interesse`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(interest),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || "Erro ao registrar contato");
  }
  return (await response.json()) as InterestResponse;
}
