import { Link, useLocation, useNavigate } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { breadcrumbsFor, pageTitleFor } from "./navigation";

interface AppHeaderProps {
  pathname: string;
  /** Nome da entidade atual (ex.: o cliente), no lugar do genérico "Detalhes". */
  entityLabel?: string | null;
  onOpenDrawer: () => void;
  onNewLead: () => void;
}

/**
 * Barra superior. No mobile: menu, logo e título compactos, como app.
 * No desktop: caminho de pão (o logo grande mora na sidebar) e UMA ação
 * primária contextual: "Novo imóvel" dentro de Imóveis, "Novo lead" no resto.
 */
export function AppHeader({ pathname, entityLabel, onOpenDrawer, onNewLead }: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const rawCrumbs = breadcrumbsFor(pathname);
  // Numa tela interna, troca o último rótulo genérico ("Detalhes") pelo nome
  // real da entidade quando a página o publica.
  const crumbs =
    entityLabel && rawCrumbs.length > 1
      ? rawCrumbs.map((c, i) => (i === rawCrumbs.length - 1 ? { ...c, label: entityLabel } : c))
      : rawCrumbs;
  const title = pageTitleFor(pathname);
  const inProperties = pathname.startsWith("/imoveis");
  // Página de seção (sem subrota): marca + título grande no mobile. Tela interna:
  // botão de voltar + título da tela, como um app.
  const isSection = crumbs.length === 1;
  const current = crumbs[crumbs.length - 1];
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
  // Home do app. As seções são acessadas a partir dela pelo menu.
  const isHome = pathname.startsWith("/dashboard");
  // Tela interna: o voltar segue a pilha real (volta de onde você veio); sem
  // histórico (URL direta) recua um nível na hierarquia.
  const canGoBack = location.key !== "default";
  const goBack = () => {
    if (canGoBack) navigate(-1);
    else if (parent?.to) navigate(parent.to);
  };
  // Seção (menos a Home): o voltar sempre leva para a Home, de forma previsível.
  const goHome = () => navigate("/dashboard");

  return (
    <>
      <header className="sticky top-0 z-[var(--z-header)] border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Voltar na barra: só nas telas internas (no mobile ocupa o lugar do
              menu). Nas seções o voltar fica acima do título grande. */}
          {!isSection && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Voltar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text sm:hidden"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {/* Menu: nas seções aparece no mobile e no tablet; nas telas internas
              só no tablet (no mobile o lugar é do voltar). */}
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Abrir menu"
            className={
              "h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text " +
              (isSection ? "flex lg:hidden" : "hidden sm:flex lg:hidden")
            }
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {/* Mobile: marca nas seções, título da tela nas internas. */}
          {isSection ? (
            <img src="/logo-wordmark.svg" alt="Nexlar" className="h-7 w-auto object-contain object-left sm:hidden" />
          ) : (
            <h1 className="truncate text-h3 text-text sm:hidden">{current.label}</h1>
          )}

          {/* Caminho de pão a partir do tablet. */}
          <nav aria-label="Caminho de pão" className="hidden min-w-0 sm:block">
            <ol className="flex items-center gap-1.5 text-body-sm">
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 && (
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-text-subtle"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {isLast || !crumb.to ? (
                      <span
                        aria-current={isLast ? "page" : undefined}
                        className="truncate font-semibold text-text"
                      >
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.to}
                        className="truncate text-text-muted transition-colors hover:text-text"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {inProperties ? (
            <button
              type="button"
              onClick={() => navigate("/imoveis/novo")}
              aria-label="Novo imóvel"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-accent px-3.5 text-body-sm font-semibold text-accent-on transition-colors hover:bg-accent-hover active:scale-[0.98] sm:px-4"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Novo imóvel</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onNewLead}
              aria-label="Novo lead"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-accent px-3.5 text-body-sm font-semibold text-accent-on transition-colors hover:bg-accent-hover active:scale-[0.98] sm:px-4"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Novo lead</span>
            </button>
          )}
          <AccountMenu />
        </div>
      </div>
      </header>

      {/* Título grande no mobile, estilo app. Só nas telas de seção. O voltar
          (quando você chegou navegando) fica acima do título. */}
      {isSection && (
        <div className="px-4 pt-4 pb-1 sm:hidden">
          {!isHome && (
            <button
              type="button"
              onClick={goHome}
              className="-ml-1 mb-1 inline-flex items-center gap-1 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Voltar
            </button>
          )}
          <h1 className="text-h1 text-text">{title}</h1>
        </div>
      )}
    </>
  );
}
