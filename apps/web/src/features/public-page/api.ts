import type {
  BrokerProfile,
  ManagedPropertiesResponse,
  ManagedProperty,
  MyPublicPageState,
  PropertyPublicVisibility,
  SlugAvailability,
  UpdatePublicPageDto,
} from "@nexlar/shared";
import { ApiError, getAccessToken, http, type ApiFieldError } from "../../lib/http";

export function fetchMyPage(): Promise<MyPublicPageState> {
  return http.get<MyPublicPageState>("/public-page/me");
}

export function updateMyPage(data: UpdatePublicPageDto): Promise<MyPublicPageState> {
  return http.patch<MyPublicPageState>("/public-page/me", data);
}

export function checkSlug(slug: string): Promise<SlugAvailability> {
  return http.get<SlugAvailability>(`/public-page/slug?slug=${encodeURIComponent(slug)}`);
}

export function publishPage(): Promise<MyPublicPageState> {
  return http.post<MyPublicPageState>("/public-page/me/publicar");
}

export function pausePage(): Promise<MyPublicPageState> {
  return http.post<MyPublicPageState>("/public-page/me/pausar");
}

export function fetchManagedProperties(): Promise<ManagedPropertiesResponse> {
  return http.get<ManagedPropertiesResponse>("/public-page/me/imoveis");
}

export function changeVisibility(
  id: string,
  visibility: PropertyPublicVisibility,
): Promise<ManagedProperty> {
  return http.patch<ManagedProperty>(`/public-page/me/imoveis/${id}/visibilidade`, { visibility });
}

export function setHighlights(propertyIds: string[]): Promise<ManagedPropertiesResponse> {
  return http.put<ManagedPropertiesResponse>("/public-page/me/destaques", { propertyIds });
}

/** Põe no ar, de uma vez, todos os imóveis prontos que estão fora da página. */
export function publishAllProperties(): Promise<{ publicados: number }> {
  return http.post<{ publicados: number }>("/public-page/me/imoveis/publicar-todos", {});
}

/** Multipart não passa pelo cliente http (que fala JSON): fetch com o token. */
export async function uploadAvatar(foto: File): Promise<BrokerProfile> {
  const form = new FormData();
  form.append("file", foto);

  const token = getAccessToken();
  const response = await fetch("/api/brokers/me/avatar", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const payload = response.headers.get("content-type")?.includes("application/json")
    ? ((await response.json()) as unknown)
    : undefined;

  if (!response.ok) {
    const corpo = (payload ?? {}) as { message?: string; errors?: ApiFieldError[] };
    throw new ApiError(
      response.status,
      corpo.message ?? "Não foi possível enviar a foto agora.",
      corpo.errors,
    );
  }
  return payload as BrokerProfile;
}

export function removeAvatar(): Promise<BrokerProfile> {
  return http.delete<BrokerProfile>("/brokers/me/avatar");
}
