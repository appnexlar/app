import { Link } from "react-router-dom";

/** Link de voltar para a tela de entrar, com seta (padrão de navegação de app). */
export function BackToLogin({ label = "Voltar" }: { label?: string }) {
  return (
    <Link
      to="/login"
      className="mb-6 inline-flex items-center gap-1.5 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </Link>
  );
}
