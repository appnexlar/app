import { useState } from "react";

/**
 * Liga/desliga a entrada com Google. Fica false até o backend OAuth existir
 * e o Client ID do Google Cloud ser configurado. Quando true, o botão
 * redireciona para o fluxo OAuth da API.
 */
export const GOOGLE_AUTH_ENABLED = false;

export function useGoogleAuth() {
  const [pendingNotice, setPendingNotice] = useState(false);

  function startGoogleAuth() {
    if (GOOGLE_AUTH_ENABLED) {
      window.location.href = "/api/auth/google";
      return;
    }
    setPendingNotice(true);
  }

  return { startGoogleAuth, pendingNotice };
}
