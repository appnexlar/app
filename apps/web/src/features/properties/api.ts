import type {
  ChangeStatusDto,
  ConfirmAvailabilityDto,
  CreatePropertyDto,
  DuplicateCandidate,
  ExternalMediaDto,
  KnownPartner,
  MediaOrigin,
  PhotoRoom,
  PropertyContactDto,
  PropertyContactSummary,
  PropertyDetail,
  PropertyImportResult,
  PropertyListResponse,
  PropertyMediaSummary,
  PropertyStatus,
  PropertySummary,
  UpdateMediaDto,
  UpdatePropertyDto,
} from "@nexlar/shared";
import { ApiError, getAccessToken, http, refreshAccessToken } from "../../lib/http";

export interface PropertyFilters {
  q?: string;
  purpose?: string;
  category?: string;
  status?: string;
  origin?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  availabilityConfirmed?: boolean;
  sort?: string;
  page?: number;
  perPage?: number;
}

export function fetchProperties(filters: PropertyFilters): Promise<PropertyListResponse> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  });
  const qs = params.toString();
  return http.get<PropertyListResponse>(`/properties${qs ? `?${qs}` : ""}`);
}

export function fetchProperty(id: string): Promise<PropertyDetail> {
  return http.get<PropertyDetail>(`/properties/${id}`);
}

export function createProperty(dto: CreatePropertyDto): Promise<PropertySummary> {
  return http.post<PropertySummary>("/properties", dto);
}

export function updateProperty(id: string, dto: UpdatePropertyDto): Promise<PropertyDetail> {
  return http.patch<PropertyDetail>(`/properties/${id}`, dto);
}

export function changePropertyStatus(id: string, dto: ChangeStatusDto): Promise<PropertyDetail> {
  return http.patch<PropertyDetail>(`/properties/${id}/status`, dto);
}

export function confirmAvailability(
  id: string,
  dto: ConfirmAvailabilityDto,
): Promise<PropertyDetail> {
  return http.post<PropertyDetail>(`/properties/${id}/availability`, dto);
}

export function duplicateProperty(id: string): Promise<PropertySummary> {
  return http.post<PropertySummary>(`/properties/${id}/duplicate`);
}

export function deleteProperty(id: string): Promise<void> {
  return http.delete<void>(`/properties/${id}`);
}

/** Importa um imóvel a partir da URL pública do anúncio (rascunho + resumo). */
export function importProperty(url: string, force?: boolean): Promise<PropertyImportResult> {
  return http.post<PropertyImportResult>("/properties/imports", force ? { url, force } : { url });
}

export function findDuplicates(params: {
  externalCode?: string;
  externalLink?: string;
  street?: string;
  addressNumber?: string;
  excludeId?: string;
}): Promise<DuplicateCandidate[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  return http.get<DuplicateCandidate[]>(`/properties/duplicates?${qs.toString()}`);
}

/** Parceiros que o corretor já cadastrou antes (reuso; só a própria carteira). */
export function searchPartners(q: string): Promise<KnownPartner[]> {
  return http.get<KnownPartner[]>(`/properties/partners?q=${encodeURIComponent(q)}`);
}

export function addContact(
  propertyId: string,
  dto: PropertyContactDto,
): Promise<PropertyContactSummary> {
  return http.post<PropertyContactSummary>(`/properties/${propertyId}/contacts`, dto);
}

export function removeContact(propertyId: string, contactId: string): Promise<void> {
  return http.delete<void>(`/properties/${propertyId}/contacts/${contactId}`);
}

export function addExternalMedia(
  propertyId: string,
  dto: ExternalMediaDto,
): Promise<PropertyMediaSummary> {
  return http.post<PropertyMediaSummary>(`/properties/${propertyId}/media/external`, dto);
}

export function updateMedia(
  propertyId: string,
  mediaId: string,
  dto: UpdateMediaDto,
): Promise<PropertyMediaSummary> {
  return http.patch<PropertyMediaSummary>(`/properties/${propertyId}/media/${mediaId}`, dto);
}

export function deleteMedia(propertyId: string, mediaId: string): Promise<void> {
  return http.delete<void>(`/properties/${propertyId}/media/${mediaId}`);
}

/** Upload multipart com progresso (XHR: fetch ainda não expõe progresso de envio). */
export function uploadMedia(
  propertyId: string,
  file: File,
  meta: { kind: "foto" | "video" | "planta" | "documento"; origin: MediaOrigin; authorized: boolean; room?: PhotoRoom },
  onProgress?: (percent: number) => void,
): Promise<PropertyMediaSummary> {
  const attempt = (retried: boolean): Promise<PropertyMediaSummary> =>
    new Promise((resolvePromise, reject) => {
      const form = new FormData();
      form.append("kind", meta.kind);
      form.append("origin", meta.origin);
      form.append("authorized", String(meta.authorized));
      if (meta.room) form.append("room", meta.room);
      form.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/properties/${propertyId}/media`);
      const token = getAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        // Sessão vencida no meio do cadastro: renova em silêncio e reenvia.
        if (xhr.status === 401 && !retried) {
          void refreshAccessToken().then((newToken) => {
            if (newToken) {
              attempt(true).then(resolvePromise, reject);
            } else {
              reject(new ApiError(401, "Sua sessão expirou. Entre novamente para continuar."));
            }
          });
          return;
        }
        try {
          const body = JSON.parse(xhr.responseText) as Record<string, unknown>;
          if (xhr.status >= 200 && xhr.status < 300) {
            resolvePromise(body as unknown as PropertyMediaSummary);
          } else {
            reject(new ApiError(xhr.status, (body.message as string) ?? "Falha no envio."));
          }
        } catch {
          reject(new ApiError(xhr.status, "Falha no envio."));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, "Falha de conexão durante o envio."));
      xhr.send(form);
    });

  return attempt(false);
}

/**
 * Busca a imagem privada com o token e devolve um object URL (tags <img> não
 * enviam Authorization). Cache simples por sessão.
 */
const blobCache = new Map<string, string>();

export async function fetchMediaBlob(url: string): Promise<string> {
  const cached = blobCache.get(url);
  if (cached) return cached;
  const token = getAccessToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new ApiError(response.status, "Não foi possível carregar a imagem.");
  const objectUrl = URL.createObjectURL(await response.blob());
  blobCache.set(url, objectUrl);
  return objectUrl;
}

export const AVAILABLE_STATUS_ACTIONS: { status: PropertyStatus; label: string }[] = [
  { status: "disponivel", label: "Marcar como disponível" },
  { status: "temporariamente_indisponivel", label: "Marcar como indisponível" },
  { status: "reservado", label: "Marcar como reservado" },
  { status: "em_negociacao", label: "Marcar em negociação" },
  { status: "vendido", label: "Marcar como vendido" },
  { status: "alugado", label: "Marcar como alugado" },
  { status: "arquivado", label: "Arquivar" },
];
