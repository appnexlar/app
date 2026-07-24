import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse, BrokerProfile } from "@nexlar/shared";
import { refreshAccessToken, setAccessToken, setRefreshHandler } from "../../lib/http";
import { logout } from "./api";

/**
 * Sessão do corretor, sem nada persistido no navegador.
 *
 * O refresh token vive num cookie httpOnly que o JavaScript não lê, e o access
 * token fica só nesta memória, morrendo a cada recarga. Não há localStorage nem
 * sessionStorage envolvidos: um script injetado por XSS não encontra credencial
 * nenhuma para levar.
 *
 * Consequência do desenho: ao abrir o app não se sabe de cara se há sessão. É
 * preciso perguntar ao servidor, que confere o cookie. Enquanto a resposta não
 * chega, o estado é `restaurando`, e a interface mostra uma tela neutra em vez
 * do login, que seria uma mentira momentânea para quem está logado.
 */
type EstadoSessao = "restaurando" | "com-sessao" | "sem-sessao" | "sem-rede";

interface AuthContextValue {
  broker: BrokerProfile | null;
  isAuthenticated: boolean;
  /** Enquanto true, ninguém deve decidir rota: ainda não se sabe quem é. */
  restaurando: boolean;
  /** A restauração falhou por rede, não por falta de sessão. */
  falhaDeRede: boolean;
  /** Vem do servidor, em `broker.emailVerified`. O navegador não decide isto. */
  emailVerified: boolean;
  signIn: (session: AuthResponse) => void;
  atualizarBroker: (broker: BrokerProfile) => void;
  /**
   * Relê a conta no servidor. É assim que a tela do gate descobre que o e-mail
   * acabou de ser confirmado em outra aba ou no celular.
   */
  recarregarConta: () => Promise<boolean>;
  /** Tenta restaurar de novo depois de uma falha de rede. */
  tentarNovamente: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Troca o cookie por um access token novo. O corpo não leva refresh token: o
 * navegador manda o cookie sozinho e o servidor devolve o cookie rotacionado.
 *
 * `credentials: "same-origin"` é o padrão e basta, porque o front chama /api na
 * própria origem (proxy da Vercel em produção, proxy do Vite em desenvolvimento).
 */
async function pedirRenovacao(): Promise<AuthResponse | null | "erro-de-rede"> {
  try {
    const response = await fetch("/api/auth/refresh", { method: "POST" });

    // 409: outra aba renovou primeiro e este cookie ficou para trás. Não é
    // sessão perdida. Uma segunda tentativa já sai com o cookie atualizado.
    if (response.status === 409) {
      await new Promise((r) => setTimeout(r, 400));
      return pedirRenovacao();
    }

    if (response.ok) return (await response.json()) as AuthResponse;

    // SÓ o 401 quer dizer "não há sessão". Qualquer outra falha (502 do proxy
    // com a API fora do ar, 500, tempo esgotado) é problema de infraestrutura,
    // e tratá-la como sessão inexistente jogaria no login quem está logado,
    // fazendo parecer que a sessão caiu quando o que caiu foi o servidor.
    if (response.status === 401) return null;
    return "erro-de-rede";
  } catch {
    // Sem conexão nenhuma: mesmo raciocínio.
    return "erro-de-rede";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [broker, setBroker] = useState<BrokerProfile | null>(null);
  const [estado, setEstado] = useState<EstadoSessao>("restaurando");
  const [tentativa, setTentativa] = useState(0);

  const aplicar = useCallback((sessao: AuthResponse) => {
    setAccessToken(sessao.tokens.accessToken);
    setBroker(sessao.broker);
  }, []);

  // Restauração ao abrir o app, e a cada nova tentativa depois de falha de rede.
  useEffect(() => {
    let cancelado = false;

    void (async () => {
      setEstado("restaurando");
      const resultado = await pedirRenovacao();
      if (cancelado) return;

      if (resultado === "erro-de-rede") {
        setEstado("sem-rede");
        return;
      }
      if (!resultado) {
        setAccessToken(null);
        setBroker(null);
        setEstado("sem-sessao");
        return;
      }
      aplicar(resultado);
      setEstado("com-sessao");
    })();

    return () => {
      cancelado = true;
    };
  }, [tentativa, aplicar]);

  // Renovação silenciosa: o cliente http chama isto ao receber 401, e um
  // temporizador antecipa o vencimento do access token de 15 min.
  useEffect(() => {
    setRefreshHandler(async () => {
      const resultado = await pedirRenovacao();
      if (!resultado || resultado === "erro-de-rede") return null;
      aplicar(resultado);
      return resultado.tokens.accessToken;
    });

    if (broker) {
      const interval = setInterval(() => void refreshAccessToken(), 10 * 60 * 1000);
      return () => {
        clearInterval(interval);
        setRefreshHandler(null);
      };
    }
    return () => setRefreshHandler(null);
  }, [broker?.id, aplicar]);

  const value = useMemo<AuthContextValue>(
    () => ({
      broker,
      isAuthenticated: broker !== null,
      restaurando: estado === "restaurando",
      falhaDeRede: estado === "sem-rede",
      emailVerified: broker?.emailVerified ?? false,

      signIn: (sessao) => {
        aplicar(sessao);
        setEstado("com-sessao");
      },

      atualizarBroker: (novo) => setBroker(novo),

      recarregarConta: async () => {
        const resultado = await pedirRenovacao();
        if (!resultado || resultado === "erro-de-rede") return false;
        aplicar(resultado);
        return resultado.broker.emailVerified;
      },

      tentarNovamente: () => setTentativa((n) => n + 1),

      signOut: async () => {
        // O servidor revoga o token e apaga o cookie. Mesmo se a chamada
        // falhar, o estado local é limpo: quem clicou em sair tem que sair.
        try {
          await logout();
        } catch {
          // Sem conexão ou sessão já encerrada: seguir com a saída local.
        }
        setAccessToken(null);
        setBroker(null);
        setEstado("sem-sessao");
      },
    }),
    [broker, estado, aplicar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
