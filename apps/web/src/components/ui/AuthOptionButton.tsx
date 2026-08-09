import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

interface AuthOptionButtonProps {
  onClick: () => void;
  label: string;
  /** Ícone à esquerda do rótulo. */
  icon: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /**
   * "principal" é o caminho que queremos que a pessoa siga: fundo sólido,
   * borda firme e sombra. "alternativo" é o mesmo botão em voz baixa, para
   * existir sem competir. A diferença é de peso, nunca de tamanho: dois
   * caminhos válidos precisam da mesma área de toque.
   */
  peso?: "principal" | "alternativo";
}

/**
 * Botão das escolhas de entrada, no tamanho de destaque das telas de
 * autenticação. Fonte única: Google e e-mail dividem a mesma caixa, e é só o
 * peso visual que diz qual é o caminho recomendado.
 */
export function AuthOptionButton({
  onClick,
  label,
  icon,
  disabled,
  loading = false,
  peso = "principal",
}: AuthOptionButtonProps) {
  const principal = peso === "principal";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={
        "inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border px-6 " +
        "text-[16px] font-semibold transition-[background-color,box-shadow,transform,border-color] " +
        "duration-fast ease-standard active:scale-[0.99] focus-visible:shadow-focus " +
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 " +
        (principal
          ? // Borda no laranja da marca: é ela que aponta qual é a ação da
            // tela, sem pintar o botão inteiro e brigar com o "G" colorido.
            "border-accent bg-surface text-text shadow-xs hover:bg-accent-soft hover:shadow-sm "
          : "border-border bg-transparent text-text-muted hover:border-border-strong hover:bg-surface hover:text-text ")
      }
    >
      <span className="flex h-5 w-5 flex-none items-center justify-center">
        {loading ? <Spinner className="h-5 w-5" /> : icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** O "G" do Google, nas cores oficiais. Recolorir faria o botão perder a cara. */
export function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
