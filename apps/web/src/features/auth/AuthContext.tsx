import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse, BrokerProfile } from "@nexlar/shared";
import { refreshAccessToken, setAccessToken, setRefreshHandler } from "../../lib/http";
import { clearSession, loadSession, saveSession, type StoredSession } from "./storage";

interface AuthState {
  broker: BrokerProfile | null;
  emailVerified: boolean;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  /**
   * Guarda a sessão recém-criada. `emailVerified` default true (login de
   * conta existente); o cadastro novo passa false para cair no gate de e-mail.
   */
  signIn: (session: AuthResponse, emailVerified?: boolean) => void;
  /** Marca o e-mail como confirmado (após o gate). */
  confirmEmail: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Restaura a sessão de forma síncrona, antes do primeiro render.
function restoreInitialState(): AuthState {
  const stored = loadSession();
  if (!stored) return { broker: null, emailVerified: false };
  setAccessToken(stored.tokens.accessToken);
  return { broker: stored.broker, emailVerified: stored.emailVerified };
}

/**
 * Troca o refresh token guardado por um novo par (rotação no backend).
 * Usa fetch direto (não o cliente http) para nunca entrar em loop de 401.
 * Retorna o novo access token, ou null quando a sessão realmente acabou.
 */
async function refreshSession(): Promise<string | null> {
  const stored = loadSession();
  if (!stored?.tokens.refreshToken) return null;
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: stored.tokens.refreshToken }),
    });
    if (!response.ok) return null;
    const session = (await response.json()) as AuthResponse;
    saveSession({ ...stored, broker: session.broker, tokens: session.tokens });
    setAccessToken(session.tokens.accessToken);
    return session.tokens.accessToken;
  } catch {
    // Rede fora do ar não é sessão expirada: mantém o token atual.
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(restoreInitialState);

  // Renovação silenciosa: o cliente http chama isto ao receber 401.
  // Além disso, renova ao abrir o app e periodicamente (antes do access
  // token de 15 min vencer), para a sessão nunca cair no meio do trabalho.
  // IMPORTANTE: as renovações proativas passam por refreshAccessToken()
  // (single-flight) para nunca rotacionar o refresh token duas vezes em
  // paralelo com a renovação disparada por um 401.
  useEffect(() => {
    setRefreshHandler(refreshSession);
    if (state.broker) {
      void refreshAccessToken();
      const interval = setInterval(() => void refreshAccessToken(), 10 * 60 * 1000);
      return () => {
        clearInterval(interval);
        setRefreshHandler(null);
      };
    }
    return () => setRefreshHandler(null);
    // Reinicia o ciclo quando muda o corretor logado (login/logout).
  }, [state.broker?.id]);

  const value = useMemo<AuthContextValue>(() => {
    const persist = (session: StoredSession) => {
      saveSession(session);
      setAccessToken(session.tokens.accessToken);
      setState({ broker: session.broker, emailVerified: session.emailVerified });
    };

    return {
      broker: state.broker,
      emailVerified: state.emailVerified,
      isAuthenticated: state.broker !== null,
      signIn: (session, emailVerified = true) =>
        persist({ ...session, emailVerified }),
      confirmEmail: () => {
        const stored = loadSession();
        if (stored) persist({ ...stored, emailVerified: true });
      },
      signOut: () => {
        clearSession();
        setAccessToken(null);
        setState({ broker: null, emailVerified: false });
      },
    };
  }, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
