import type { BrokerProfile, UpdateProfileDto } from "@nexlar/shared";
import { ApiError, getAccessToken, http, type ApiFieldError } from "../../lib/http";

/** Perfil do corretor logado, direto do servidor. */
export function fetchMe(): Promise<BrokerProfile> {
  return http.get<BrokerProfile>("/brokers/me");
}

/** Salva os campos editáveis do perfil e devolve o perfil atualizado. */
export function updateMe(data: UpdateProfileDto): Promise<BrokerProfile> {
  return http.patch<BrokerProfile>("/brokers/me", data);
}

/**
 * Envia o CRECI para verificação. Multipart, porque vai o documento junto,
 * então não passa pelo cliente http (que fala JSON): é fetch direto com o
 * token da sessão.
 */
export async function submitCreci(dados: {
  creci: string;
  creciUf: string;
  documento: File;
}): Promise<BrokerProfile> {
  const form = new FormData();
  // Os campos de texto vêm antes do arquivo de propósito: o servidor lê o
  // multipart em ordem, e assim os valores já existem quando o arquivo chega.
  form.append("creci", dados.creci);
  form.append("creciUf", dados.creciUf);
  form.append("file", dados.documento);

  const token = getAccessToken();
  const response = await fetch("/api/brokers/me/creci", {
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
      corpo.message ?? "Não foi possível enviar seu CRECI agora.",
      corpo.errors,
    );
  }

  return payload as BrokerProfile;
}
