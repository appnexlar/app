import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authProviders } from "./api";

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

/**
 * Se este ambiente tem entrada pelo Google.
 *
 * Quem responde é a API, porque é ela que sabe se a credencial existe. Sem
 * isso, um ambiente sem credencial mostraria um botão bonito que responde 404,
 * e ligar o recurso exigiria publicar o site de novo em vez de só mexer numa
 * variável de ambiente.
 *
 * Enquanto a resposta não chega, `pronto` é false e a tela segura a decisão:
 * mostrar só o e-mail e depois fazer o Google aparecer sozinho seria pior que
 * esperar um instante.
 */
export function useAuthProviders() {
  const consulta = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: authProviders,
    // Não muda enquanto o app estiver aberto: depende do ambiente, não da sessão.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    // Se a consulta falhar, o e-mail sozinho ainda deixa a pessoa entrar. Um
    // botão do Google que talvez não funcione é o pior dos dois desfechos.
    google: consulta.data?.google ?? false,
    pronto: !consulta.isPending,
  };
}
