import { useEffect } from "react";

/**
 * Marca a página como não indexável enquanto montada. As páginas por token
 * (/selecao/...) são pessoais: buscador nenhum tem o que fazer nelas, e um
 * link indexado seria vazamento de dado pessoal por preguiça nossa.
 */
export function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}
