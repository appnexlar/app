import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse, BrokerProfile } from "@nexlar/shared";
import { refreshAccessToken, setAccessToken, setRefreshHandler } from "../../lib/http";
import { clearSession, loadSession, saveSession, type StoredSession } from "./storage";
import { logout } from "./api";

interface AuthContextValue {
  broker: BrokerProfile | null;
  isAuthenticated: boolean;
  /** Vem do servidor, em `broker.emailVerified`. O navegador não decide isto. */
  emailVerified: boolean;
  signIn: (session: AuthResponse) => void;
  /**
   * Busca o estado atual da conta no servidor. É assim que a tela do gate
   * descobre que o e-mail acabou de ser confirmado em outra aba ou no celular.
   * Retorna true quando o e-mail já está confirmado.
   */
  recarregarConta: () => Promise<boolean>;
  /** Grava um perfil recém-atualizado (ex.: após editar os dados de contato). */
  atualizarBroker: (broker: BrokerProfile) => void;
  /** Encerra a sessão aqui e no servidor. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Restaura a sessão de forma síncrona, antes do primeiro render.
function restoreInitialBroker(): BrokerProfile | null {
  const stored = loadSession();
  if (!stored) return null;
  setAccessToken(stored.tokens.accessToken);
  return stored.broker;
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
    saveSession({ broker: session.broker, tokens: session.tokens });
    setAccessToken(session.tokens.accessToken);
    return session.tokens.accessToken;
  } catch {
    // Rede fora do ar não é sessão expirada: mantém o token atual.
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [broker, setBroker] = useState<BrokerProfile | null>(restoreInitialBroker);

  /**
   * Identidade estável, e isso não é preciosismo: como ela chama setBroker,
   * qualquer efeito que a tivesse nas dependências e a chamasse entraria em
   * laço infinito, renovando a sessão sem parar. Ela não precisa de nada do
   * render, só de localStorage e do renovador, então mora fora do useMemo.
   */
  const recarregarConta = useCallback(async () => {
    // A renovação devolve o perfil atualizado junto com o novo par de tokens,
    // então não precisa de rota separada só para reler a conta.
    const novoToken = await refreshAccessToken();
    if (!novoToken) return false;
    const atualizado = loadSession();
    if (atualizado) setBroker(atualizado.broker);
    return atualizado?.broker.emailVerified ?? false;
  }, []);

  // Renovação silenciosa: o cliente http chama isto ao receber 401.
  // Além disso, renova ao abrir o app e periodicamente (antes do access
  // token de 15 min vencer), para a sessão nunca cair no meio do trabalho.
  // IMPORTANTE: as renovações proativas passam por refreshAccessToken()
  // (single-flight) para nunca rotacionar o refresh token duas vezes em
  // paralelo com a renovação disparada por um 401.
  useEffect(() => {
    setRefreshHandler(refreshSession);
    if (broker) {
      void refreshAccessToken();
      const interval = setInterval(() => void refreshAccessToken(), 10 * 60 * 1000);
      return () => {
        clearInterval(interval);
        setRefreshHandler(null);
      };
    }
    return () => setRefreshHandler(null);
    // Reinicia o ciclo quando muda o corretor logado (login/logout).
  }, [broker?.id]);

  const value = useMemo<AuthContextValue>(() => {
    const persist = (session: StoredSession) => {
      saveSession(session);
      setAccessToken(session.tokens.accessToken);
      setBroker(session.broker);
    };

    return {
      broker,
      isAuthenticated: broker !== null,
      emailVerified: broker?.emailVerified ?? false,
      signIn: (session) => persist({ broker: session.broker, tokens: session.tokens }),
      recarregarConta,

      atualizarBroker: (novo) => {
        // Reaproveita os tokens da sessão atual, trocando só o perfil.
        const atual = loadSession();
        if (!atual) return;
        saveSession({ ...atual, broker: novo });
        setBroker(novo);
      },

      signOut: async () => {
        // Pega o refresh token antes de limpar, revoga no servidor e só então
        // apaga daqui. Se a rede falhar, o local é limpo do mesmo jeito: a
        // pessoa clicou em sair e tem que sair.
        const refreshToken = loadSession()?.tokens.refreshToken;
        try {
          if (refreshToken) await logout(refreshToken);
        } catch {
          // Sessão já revogada ou sem conexão: seguir com a saída local.
        }
        clearSession();
        setAccessToken(null);
        setBroker(null);
      },
    };
  }, [broker, recarregarConta]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
