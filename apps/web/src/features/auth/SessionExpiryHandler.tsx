import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setAccountBlockedHandler, setUnauthorizedHandler } from "../../lib/http";
import { useAuth } from "./AuthContext";

/**
 * Reage aos três jeitos de a conta parar de valer no meio do uso, para o
 * corretor nunca ficar olhando uma tela quebrada sem entender o motivo:
 *
 * - 401: a sessão expirou. Encerra e leva ao login com aviso.
 * - 403 conta_suspensa: encerra e leva ao login, que mostra o motivo.
 * - 403 email_nao_confirmado: mantém a sessão e leva ao gate, porque aqui a
 *   pessoa ainda tem o que fazer, é só confirmar o e-mail.
 */
export function SessionExpiryHandler() {
  const { signOut, recarregarConta } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // O navigate espera o signOut terminar de propósito. Saindo na frente, a
    // sessão ainda existe por um instante, a rota de convidado devolve para a
    // área logada, e quando o signOut enfim conclui o app cai no login sem o
    // parâmetro: o corretor voltaria para a tela de entrada sem explicação
    // nenhuma do que aconteceu.
    setUnauthorizedHandler(() => {
      void signOut().then(() => navigate("/login?sessao=expirada", { replace: true }));
    });

    setAccountBlockedHandler((code) => {
      if (code === "conta_suspensa") {
        void signOut().then(() => navigate("/login?conta=suspensa", { replace: true }));
        return;
      }
      // Relê a conta antes de desviar: se o e-mail acabou de ser confirmado
      // em outra aba, a sessão daqui ainda não sabia, e mandar para o gate
      // seria falso alarme.
      void recarregarConta().then((confirmado) => {
        if (!confirmado) navigate("/confirmar-email", { replace: true });
      });
    });

    return () => {
      setUnauthorizedHandler(null);
      setAccountBlockedHandler(null);
    };
  }, [signOut, recarregarConta, navigate]);

  return null;
}
