/**
 * Cliente HTTP único do app. Todas as chamadas à API passam por aqui.
 * Base /api é encaminhada pelo proxy do Vite para a API NestJS em dev.
 */

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: ApiFieldError[],
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  message?: string;
  errors?: ApiFieldError[];
  details?: Record<string, unknown>;
}

const BASE_URL = "/api";

// Token de acesso em memória, definido pela camada de autenticação.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Para chamadas fora do cliente padrão (upload XHR, download de mídia privada). */
export function getAccessToken(): string | null {
  return accessToken;
}

// Handler de sessão expirada: chamado quando uma requisição autenticada
// (com token) recebe 401 e a renovação silenciosa falha.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/**
 * Conta bloqueada no meio do uso: e-mail ainda não confirmado ou conta
 * suspensa. Vem de um 403 com código, e não de comparação de texto, porque
 * 403 também é usado por regra de negócio comum (compartilhamento, por
 * exemplo) e ali não se deve mexer na sessão.
 */
export type AccountBlockCode = "email_nao_confirmado" | "conta_suspensa";

let onAccountBlocked: ((code: AccountBlockCode) => void) | null = null;

export function setAccountBlockedHandler(
  fn: ((code: AccountBlockCode) => void) | null,
): void {
  onAccountBlocked = fn;
}

// Renovação silenciosa da sessão. A camada de auth registra a função que
// troca o refresh token por um novo access token (retorna null se não der).
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setRefreshHandler(fn: (() => Promise<string | null>) | null): void {
  refreshHandler = fn;
}

// Single-flight: várias requisições com 401 simultâneo disparam UMA renovação.
let refreshInFlight: Promise<string | null> | null = null;

/** Tenta renovar o access token. Compartilhada com o upload (XHR). */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  if (!refreshInFlight) {
    refreshInFlight = refreshHandler()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  // Só declara JSON quando há corpo: o Fastify recusa content-type
  // application/json com corpo vazio (ex.: DELETE sem payload).
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const hadToken = Boolean(accessToken);
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Falha de rede (API fora do ar, sem conexão).
    throw new ApiError(0, "Não foi possível conectar ao servidor. Tente novamente.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : undefined;

  if (!response.ok) {
    // Access token venceu: renova em silêncio e repete a chamada UMA vez.
    // Rotas de auth ficam de fora para não entrar em loop.
    if (response.status === 401 && hadToken && !retried && !path.startsWith("/auth/")) {
      const newToken = await refreshAccessToken();
      if (newToken) return request<T>(method, path, body, true);
      onUnauthorized?.();
    } else if (response.status === 401 && hadToken && !path.startsWith("/auth/")) {
      onUnauthorized?.();
    }
    const errorBody = (payload ?? {}) as ErrorBody;

    if (response.status === 403 && !path.startsWith("/auth/")) {
      const code = errorBody.details?.code;
      if (code === "email_nao_confirmado" || code === "conta_suspensa") {
        onAccountBlocked?.(code);
      }
    }

    throw new ApiError(
      response.status,
      errorBody.message ?? "Ocorreu um erro inesperado.",
      errorBody.errors,
      errorBody.details,
    );
  }

  return payload as T;
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
