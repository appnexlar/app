import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";

/** Ações do layout-base disponíveis para as páginas internas via Outlet. */
export interface ShellContextValue {
  openNewLead: () => void;
  /** Define o rótulo da entidade atual (nome no caminho de pão e título). */
  setEntityLabel: (label: string | null) => void;
  /** Avisa o layout que a página tem barra de ação fixa no rodapé. */
  setHasActionBar: (has: boolean) => void;
}

export function useShell(): ShellContextValue {
  return useOutletContext<ShellContextValue>();
}

/**
 * Publica o nome da entidade da página (ex.: o cliente) para o cabeçalho usar
 * no caminho de pão e no título, em vez do genérico "Detalhes". Limpa ao sair.
 */
export function usePageEntityLabel(label: string | null | undefined): void {
  const { setEntityLabel } = useShell();
  useEffect(() => {
    setEntityLabel(label ?? null);
    return () => setEntityLabel(null);
  }, [label, setEntityLabel]);
}

/**
 * Declara que a página tem barra de ação fixa no rodapé. O layout usa isso
 * para tirar o balão de ajuda do caminho: nada pode cobrir o botão primário.
 */
export function usePageActionBar(active: boolean): void {
  const { setHasActionBar } = useShell();
  useEffect(() => {
    setHasActionBar(active);
    return () => setHasActionBar(false);
  }, [active, setHasActionBar]);
}
