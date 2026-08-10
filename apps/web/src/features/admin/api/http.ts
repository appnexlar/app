import { ApiError, type ApiFieldError } from "../../../lib/http";
import type { AdminAuthResponse } from "@nexlar/shared";

/**
 * Cliente HTTP do Nexlar Admin, separado do cliente do corretor de
 * propósito: token próprio em memória, renovação própria (o cookie do admin
 * mora em /api/admin/auth) e nenhum handler compartilhado. Uma sessão não
 * deve conseguir vazar para dentro da outra nem por engano de import.
 */

const BASE_URL = "/api/admin";

let adminToken: string | null = null;

export function setAdminToken(token: string | null): void {
  adminToken = token;
}

let onSessionExpired: (() => void) | null = null;

export function setAdminSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

// Single-flight da renovação, igual ao cliente do corretor.
let refreshInFlight: Promise<AdminAuthResponse | null> | null = null;

export function refreshAdminSession(): Promise<AdminAuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as AdminAuthResponse;
        adminToken = data.accessToken;
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface ErrorBody {
  message?: string;
  errors?: ApiFieldError[];
  details?: Record<string, unknown>;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Não foi possível conectar ao servidor. Tente novamente.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : undefined;

  if (!response.ok) {
    if (response.status === 401 && !retried && !path.startsWith("/auth/")) {
      const renewed = await refreshAdminSession();
      if (renewed) return request<T>(method, path, body, true);
      onSessionExpired?.();
    }
    const errorBody = (payload ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      errorBody.message ?? "Ocorreu um erro inesperado.",
      errorBody.errors,
      errorBody.details,
    );
  }

  return payload as T;
}

export const adminHttp = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};
