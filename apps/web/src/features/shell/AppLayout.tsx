import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { AppHeader } from "./AppHeader";
import { NewLeadModal } from "../leads/NewLeadModal";
import { ContextualHelpPanel } from "../guidance/ContextualHelpPanel";
import type { PageAction, ShellContextValue } from "./ShellContext";

const COLLAPSE_KEY = "nexlar.sidebar.collapsed";

/** Layout-base de toda a área autenticada. */
export function AppLayout() {
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [entityLabel, setEntityLabel] = useState<string | null>(null);
  const [hasActionBar, setHasActionBar] = useState(false);
  const [pageAction, setPageAction] = useState<PageAction | null>(null);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Fecha o drawer ao trocar de rota (redundância segura com o onClose dos itens).
  useEffect(() => {
    setDrawerOpen(false);
    setEntityLabel(null);
    setHasActionBar(false);
    // A ação da página NÃO é limpa aqui: o efeito do filho roda antes do
    // efeito do pai, então limpar na troca de rota apagaria a ação que a
    // página nova acabou de publicar. Quem limpa é o cleanup do usePageAction,
    // que roda na desmontagem da página anterior.
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] bg-bg">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          pathname={location.pathname}
          entityLabel={entityLabel}
          pageAction={pageAction}
          onOpenDrawer={() => setDrawerOpen(true)}
          onNewLead={() => setNewLeadOpen(true)}
        />
        {/* O espaço de cima mora no bloco de identidade do AppHeader, por isso
            o <main> só reserva o respiro entre o título e o conteúdo. */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-5">
          <Outlet
            context={
              {
                openNewLead: () => setNewLeadOpen(true),
                setEntityLabel,
                setHasActionBar,
                setPageAction,
              } satisfies ShellContextValue
            }
          />
        </main>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <NewLeadModal open={newLeadOpen} onClose={() => setNewLeadOpen(false)} />
      <ContextualHelpPanel elevated={hasActionBar} />
    </div>
  );
}
