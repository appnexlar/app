import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setUnauthorizedHandler } from "../../lib/http";
import { useAuth } from "./AuthContext";

/**
 * Reage à sessão expirada: quando uma chamada autenticada recebe 401,
 * encerra a sessão e leva ao login com aviso, sem deixar tela quebrada.
 */
export function SessionExpiryHandler() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
      navigate("/login?sessao=expirada", { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut, navigate]);

  return null;
}
