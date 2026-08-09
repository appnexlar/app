import { useState } from "react";

/**
 * Manda o navegador para o Google.
 *
 * É uma navegação de página inteira, e não uma chamada de JavaScript, porque o
 * fluxo depende de dois saltos de topo (ir ao Google e voltar) e de cookies que
 * o JavaScript não enxerga. Por isso não existe estado de "carregando" que
 * termine: a tela simplesmente sai do ar quando o navegador vai embora.
 */
export function useGoogleAuth() {
  const [saindo, setSaindo] = useState(false);

  function startGoogleAuth() {
    setSaindo(true);
    window.location.href = "/api/auth/google";
  }

  return { startGoogleAuth, saindo };
}
