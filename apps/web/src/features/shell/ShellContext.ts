import { useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";

/** A ação de criar da seção atual, publicada pela própria página. */
export interface PageAction {
  label: string;
  onClick: () => void;
}

/** Ações do layout-base disponíveis para as páginas internas via Outlet. */
export interface ShellContextValue {
  openNewLead: () => void;
  /** Define o rótulo da entidade atual (nome no caminho de pão e título). */
  setEntityLabel: (label: string | null) => void;
  /** Avisa o layout que a página tem barra de ação fixa no rodapé. */
  setHasActionBar: (has: boolean) => void;
  /** Publica a ação de criar da seção, exibida ao lado do título. */
  setPageAction: (action: PageAction | null) => void;
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
/**
 * Publica a ação de criar da seção, que o cabeçalho mostra ao lado do título.
 *
 * A barra do topo tinha UM botão que mudava de significado conforme a rota
 * ("Novo lead" aqui, "Novo imóvel" ali). Mesmo lugar, mesma cor, resultado
 * diferente: quem clicava não sabia o que ia abrir. Agora cada seção declara
 * a sua ação, ela aparece dentro da página, junto do título que a explica, e
 * a barra fica só com o que não muda.
 *
 * Passar `null` no rótulo tira a ação (útil enquanto a lista carrega).
 */
export function usePageAction(label: string | null, onClick: () => void): void {
  const { setPageAction } = useShell();
  // O onClick chega novo a cada render da página; guardá-lo numa ref evita
  // republicar a ação (e piscar o botão) a cada digitada num filtro.
  const acao = useRef(onClick);
  acao.current = onClick;
  useEffect(() => {
    if (!label) {
      setPageAction(null);
      return;
    }
    setPageAction({ label, onClick: () => acao.current() });
    return () => setPageAction(null);
  }, [label, setPageAction]);
}

export function usePageActionBar(active: boolean): void {
  const { setHasActionBar } = useShell();
  useEffect(() => {
    setHasActionBar(active);
    return () => setHasActionBar(false);
  }, [active, setHasActionBar]);
}
