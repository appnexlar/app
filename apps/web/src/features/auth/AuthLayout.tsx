import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

/** Estrutura comum das telas de autenticação: painel de marca + coluna do formulário. */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      {/* Painel de marca, visível a partir de lg. */}
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 10%, var(--brand-navy-700) 0%, var(--primary) 45%, var(--primary-active) 100%)",
          }}
        />
        <img src="/logo-white.svg" alt="Nexlar" className="relative h-10 w-auto" />
        <div className="relative max-w-sm">
          <h2 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-text-on-brand">
            Cada lead no lugar certo, cada cliente na próxima ação.
          </h2>
          <p className="mt-4 text-body text-[var(--brand-navy-100)]">
            O jeito organizado de acompanhar seus atendimentos do primeiro
            contato ao fechamento.
          </p>
        </div>
        <span className="relative text-caption text-[var(--brand-navy-200)]">
          Nexlar · gestão para corretores
        </span>
      </aside>

      {/* Coluna do formulário. */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          {/* Marca no topo, só no mobile/tablet. */}
          <img
            src="/logo-wordmark.svg"
            alt="Nexlar"
            className="mb-10 h-10 w-auto lg:hidden"
          />
          {children}
        </div>
      </main>
    </div>
  );
}

/** Divisor "ou" entre a autenticação social e o formulário de e-mail. */
export function OrDivider() {
  return (
    <div className="my-7 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-caption text-text-subtle">ou</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
