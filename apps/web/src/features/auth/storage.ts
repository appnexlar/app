import type { AuthResponse } from "@nexlar/shared";

const STORAGE_KEY = "nexlar.session";

/**
 * Sessão persistida entre recarregamentos.
 * `emailVerified` é mantido no cliente nesta fase. TODO(backend): passar a ler
 * de `broker.emailVerified` quando a API tiver o campo; remover este flag.
 */
export interface StoredSession {
  broker: AuthResponse["broker"];
  tokens: AuthResponse["tokens"];
  emailVerified: boolean;
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
