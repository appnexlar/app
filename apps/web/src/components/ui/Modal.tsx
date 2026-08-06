import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Modal centralizado no desktop, folha inferior (bottom sheet) no mobile. */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal para o body: as seções das fichas usam animate-rise, cuja animação
  // preenchida (fill-mode both) mantém cada seção como stacking context para
  // sempre. Um modal renderizado DENTRO de uma seção fica preso nela e as
  // seções seguintes pintam por cima, overlay e tudo. No body, o z-modal
  // compete no contexto da página, como deve. Mesmo remédio do menu do Select.
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-[var(--overlay)] animate-[fade_0.2s_ease]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // max-h + rolagem própria: com o body travado, um modal mais alto que a
        // tela ficava com o topo cortado e inalcançável no celular.
        className="animate-rise relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-6 shadow-lg sm:max-h-[88dvh] sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-h2 text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
