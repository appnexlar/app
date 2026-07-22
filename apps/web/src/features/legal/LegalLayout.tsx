import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Banner } from "../../components/ui/Banner";

/** Casca das páginas legais (Termos, Privacidade). Leitura, mobile-first. */
export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Voltar
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="text-h1 text-text">{title}</h1>
        <p className="mt-1 text-body-sm text-text-muted">Última atualização: {updatedAt}</p>

        <div className="mt-5">
          <Banner variant="info">
            Documento em elaboração (rascunho). O texto jurídico definitivo será
            publicado antes do lançamento, com revisão profissional.
          </Banner>
        </div>

        <div className="legal-body mt-8 flex flex-col gap-6 text-body text-text">{children}</div>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-h3 text-text">{title}</h2>
      <div className="flex flex-col gap-2 text-body text-text-muted">{children}</div>
    </section>
  );
}
