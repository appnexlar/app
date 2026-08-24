import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Menu, Plus } from "lucide-react";
import { ICON } from "../../components/ui/icon";
import { AccountMenu } from "./AccountMenu";
import { NotificationBell } from "../notifications/NotificationBell";
import type { PageAction } from "./ShellContext";
import { NAV_ITEMS, breadcrumbsFor, pageTitleFor } from "./navigation";

interface AppHeaderProps {
  pathname: string;
  /** Nome da entidade atual (ex.: o cliente), no lugar do genérico "Detalhes". */
  entityLabel?: string | null;
  /** Ação de criar declarada pela seção atual (ver usePageAction). */
  pageAction?: PageAction | null;
  onOpenDrawer: () => void;
  onNewLead: () => void;
}

/**
 * Barra superior e identidade da página.
 *
 * A barra carrega só o que não muda de sentido: menu, marca, avisos e conta.
 * A ação de criar mora DENTRO da página, ao lado do título que a explica, e
 * quem a declara é cada seção (ver usePageAction). A exceção é a Home, que
 * não tem lista própria para criar nada: lá a barra leva "Novo lead", porque
 * cadastrar lead é a porta de entrada do produto.
 */
export function AppHeader({
  pathname,
  entityLabel,
  pageAction,
  onOpenDrawer,
  onNewLead,
}: AppHeaderProps) {
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
  // Página de seção (sem subrota): marca + título grande no mobile. Tela interna:
  // botão de voltar + título da tela, como um app.
  //
  // Vem do caminho na URL, e não do tamanho do caminho de pão: desde que a
  // Home abre o caminho, toda página tem mais de um item, e contar itens diria
  // que nem seção existe.
  const secaoAtual = NAV_ITEMS.find((i) => pathname.startsWith(i.path));
  const isSection = Boolean(secaoAtual) && pathname.replace(/\/+$/, "") === secaoAtual!.path;
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
        {/* O botão tem 40px de toque com um ícone de 22px dentro, então já
            carrega 9px invisíveis de cada lado. O -ml-2 desconta essa folga à
            esquerda (o ícone passa a alinhar com a margem do conteúdo abaixo)
            e o espaçamento curto evita somar folga com folga entre o ícone e a
            marca. */}
        <div className="-ml-2 flex min-w-0 items-center gap-1">
          {/* Voltar na barra: só nas telas internas (no mobile ocupa o lugar do
              menu). Nas seções o voltar fica acima do título grande. */}
          {!isSection && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Voltar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text sm:hidden"
            >
              <ChevronLeft size={ICON.bar} aria-hidden="true" />
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
            <Menu size={ICON.bar} aria-hidden="true" />
          </button>
          {/* A barra carrega só a marca. Quem diz em que página você está é o
              bloco de identidade abaixo, igual em qualquer largura. */}
          <img
            src="/logo-wordmark.svg"
            alt="Nextlar"
            className="h-10 w-auto object-contain object-left lg:hidden"
          />
        </div>

        {/* A barra guarda o que vale em qualquer página: avisos e conta. A
            única ação daqui é a da Home, que não tem lista onde ancorá-la. */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isHome && (
            <button
              type="button"
              onClick={onNewLead}
              aria-label="Novo lead"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-on transition-colors hover:bg-accent-hover active:scale-[0.98] sm:w-auto sm:gap-2 sm:rounded-md sm:px-4 sm:text-body-sm sm:font-semibold"
            >
              <Plus size={ICON.bar} className="shrink-0 sm:size-[18px]" aria-hidden="true" />
              <span className="hidden sm:inline">Novo lead</span>
            </button>
          )}
          <NotificationBell />
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
        </div>
      </div>
      </header>

      {/* Identidade da página: caminho de pão + título grande, sempre abaixo da
          barra e igual em celular, tablet e desktop. Alinha com o <main>. */}
      {/* Na Home quem dá nome à página é a saudação do próprio conteúdo, então
          o bloco de identidade não aparece para não repetir. */}
      <div className={"mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 sm:pt-7" + (isHome ? " hidden" : "")}>
        {isSection && (
          !isHome && (
            <button
              type="button"
              onClick={goHome}
              // Some assim que o caminho de pão aparece (sm): os dois juntos
              // seriam duas formas de dizer a mesma coisa, uma acima da outra.
              className="-ml-1 mb-1 inline-flex items-center gap-1 text-body-sm font-semibold text-text-muted transition-colors hover:text-text sm:hidden"
            >
              <ChevronLeft size={ICON.hint} aria-hidden="true" />
              Voltar
            </button>
          )
        )}
        {!isHome && (
          // No celular o caminho de pão não existe: um app orienta pelo título
          // e pela seta de voltar da barra. Do tablet em diante ele volta,
          // porque aí há espaço e o mouse aproveita os atalhos.
          <nav aria-label="Caminho de pão" className="mb-1 hidden sm:block">
            <ol className="flex min-w-0 items-center gap-1.5 text-body-sm">
              {crumbs.slice(0, -1).map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && <Chevron />}
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="truncate text-text-muted transition-colors hover:text-text"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate text-text-muted">{crumb.label}</span>
                  )}
                </li>
              ))}
              <li className="flex min-w-0 items-center gap-1.5">
                <Chevron />
                <span aria-current="page" className="truncate font-semibold text-text">
                  {current.label}
                </span>
              </li>
            </ol>
          </nav>
        )}
        {/* Título e ação na mesma linha: o botão fica colado no nome da seção
            que explica o que ele cria. Duas linhas para o título, não uma com
            reticências: título de imóvel é longo e cortar no meio esconde
            justamente o que identifica o registro. */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="line-clamp-2 min-w-0 flex-1 text-h1 text-text">
            {isSection ? title : current.label}
          </h1>
          {pageAction && (
            <button
              type="button"
              onClick={pageAction.onClick}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-4 text-body-sm font-semibold text-accent-on transition-colors duration-fast hover:bg-accent-hover active:scale-[0.98] focus-visible:shadow-focus"
            >
              <Plus size={18} className="shrink-0" aria-hidden="true" />
              {pageAction.label}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Chevron() {
  return <ChevronRight size={ICON.hint} className="shrink-0 text-text-subtle" aria-hidden="true" />;
}
