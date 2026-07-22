import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { AppHeader } from "./AppHeader";
import { NewLeadModal } from "../leads/NewLeadModal";
import type { ShellContextValue } from "./ShellContext";

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
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] bg-bg">
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          pathname={location.pathname}
          entityLabel={entityLabel}
          onOpenDrawer={() => setDrawerOpen(true)}
          onNewLead={() => setNewLeadOpen(true)}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet
            context={
              { openNewLead: () => setNewLeadOpen(true), setEntityLabel } satisfies ShellContextValue
            }
          />
        </main>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <NewLeadModal open={newLeadOpen} onClose={() => setNewLeadOpen(false)} />
    </div>
  );
}
