import { NavLink, Outlet } from "react-router-dom";
import type { AdminPermission } from "@nexlar/shared";
import { ADMIN_ROLE_LABELS } from "@nexlar/shared";
import { useAdminAuth } from "../AdminAuthContext";

interface NavItem {
  to: string;
  label: string;
  /** Sem a permissão, o item nem aparece. Quem nega de verdade é a API. */
  permission?: AdminPermission;
  /** Fase futura da épica: aparece apagado, sem link, como mapa do que vem. */
  soon?: boolean;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

/** Navegação da Task 41. O que ainda não existe fica visível e desabilitado. */
const SECTIONS: NavSection[] = [
  { title: null, items: [{ to: "/admin", label: "Dashboard" }] },
  {
    title: "Gestão",
    items: [
      { to: "/admin/usuarios", label: "Usuários", permission: "admin.users.view" },
      {
        to: "/admin/organizacoes",
        label: "Organizações",
        permission: "admin.organizations.view",
        soon: true,
      },
    ],
  },
  {
    title: "Operação",
    items: [
      { to: "/admin/auditoria", label: "Auditoria", permission: "admin.audit.view", soon: true },
      {
        to: "/admin/administradores",
        label: "Administradores",
        permission: "admin.admins.view",
      },
    ],
  },
  {
    title: "Plataforma",
    items: [
      { to: "/admin/cobranca", label: "Cobrança", permission: "admin.billing.view", soon: true },
    ],
  },
];

/**
 * Shell do Nexlar Admin: sidebar escura fixa, desktop primeiro. A inversão
 * de superfície (navy) em relação ao app do corretor é proposital, para
 * ninguém operar uma conta de cliente achando que está no próprio CRM.
 */
export function AdminLayout() {
  const { admin, logout, can } = useAdminAuth();
  if (!admin) return null;

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="flex w-60 shrink-0 flex-col bg-[var(--brand-navy-950)] px-4 py-6 max-md:w-16 max-md:px-2">
        <div className="mb-8 px-2 max-md:text-center">
          <span className="text-lg font-bold tracking-tight text-white">
            nex<span className="text-accent">lar</span>
          </span>
          <span className="ml-2 rounded bg-[var(--brand-navy-800)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-navy-200)] max-md:hidden">
            Admin
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-6" aria-label="Navegação administrativa">
          {SECTIONS.map((section) => {
            const items = section.items.filter(
              (item) => !item.permission || can(item.permission),
            );
            if (items.length === 0) return null;
            return (
              <div key={section.title ?? "raiz"} className="flex flex-col gap-1">
                {section.title && (
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-navy-400)] max-md:hidden">
                    {section.title}
                  </p>
                )}
                {items.map((item) =>
                  item.soon ? (
                    <span
                      key={item.to}
                      className="flex items-center justify-between rounded-md px-2 py-2 text-[14px] text-[var(--brand-navy-500)] max-md:justify-center"
                      title="Chega numa próxima fase"
                    >
                      <span className="max-md:hidden">{item.label}</span>
                      <span className="text-[10px] uppercase max-md:hidden">em breve</span>
                      <span className="hidden max-md:inline">·</span>
                    </span>
                  ) : (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/admin"}
                      className={({ isActive }) =>
                        `rounded-md px-2 py-2 text-[14px] transition-colors max-md:text-center ${
                          isActive
                            ? "bg-[var(--brand-navy-800)] font-semibold text-white"
                            : "text-[var(--brand-navy-200)] hover:bg-[var(--brand-navy-900)] hover:text-white"
                        }`
                      }
                    >
                      <span className="max-md:hidden">{item.label}</span>
                      <span className="hidden max-md:inline">{item.label.charAt(0)}</span>
                    </NavLink>
                  ),
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-[var(--brand-navy-800)] pt-4 max-md:hidden">
          <p className="truncate px-2 text-[13px] font-medium text-white">{admin.fullName}</p>
          <p className="px-2 text-[12px] text-[var(--brand-navy-400)]">
            {ADMIN_ROLE_LABELS[admin.role]}
          </p>
          {/* Botão próprio: o ghost do design system é para superfície clara
              e some no navy da sidebar. */}
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 w-full rounded-md px-2 py-2 text-left text-[14px] text-[var(--brand-navy-200)] transition-colors hover:bg-[var(--brand-navy-900)] hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8 max-md:px-4">
        <Outlet />
      </main>
    </div>
  );
}
