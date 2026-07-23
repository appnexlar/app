import type { AuthResponse } from "@nexlar/shared";

const STORAGE_KEY = "nexlar.session";

/**
 * Sessão persistida entre recarregamentos.
 *
 * Não existe mais flag de e-mail confirmado aqui: ela vive em
 * `broker.emailVerified`, que vem do servidor a cada login e a cada renovação.
 * Antes ficava solta no navegador, onde a própria pessoa podia ligar sozinha.
 */
export interface StoredSession {
  broker: AuthResponse["broker"];
  tokens: AuthResponse["tokens"];
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
