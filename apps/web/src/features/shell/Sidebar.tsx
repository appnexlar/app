import { NavLink } from "react-router-dom";
import { ChevronLeft, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ICON } from "../../components/ui/icon";
import { NAV_GROUPS } from "./navigation";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { signOut } = useAuth();

  return (
    <aside
      className={
        "sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-base ease-standard lg:flex " +
        (collapsed ? "w-[76px]" : "w-64")
      }
    >
      {/* Logo. */}
      <div className={"flex h-16 items-center " + (collapsed ? "justify-center px-2" : "px-5")}>
        <img
          src={collapsed ? "/logo-mark.svg" : "/logo-wordmark.svg"}
          alt="Nexlar"
          className={collapsed ? "h-7 w-7 object-contain object-left" : "h-6 w-auto"}
        />
      </div>

      {/* Navegação. */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-3 text-caption font-semibold uppercase tracking-wide text-text-subtle">
                {group.title}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      "group flex items-center gap-3 rounded-md px-3 py-2.5 text-body-sm font-semibold transition-colors " +
                      (collapsed ? "justify-center " : "") +
                      (isActive
                        ? "bg-primary-soft text-primary"
                        : "text-text-muted hover:bg-surface-sunken hover:text-text")
                    }
                  >
                    <item.icon size={ICON.action} className="flex-none" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Sair + recolher. */}
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={signOut}
          title={collapsed ? "Sair" : undefined}
          className={
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-body-sm font-semibold text-text-muted transition-colors hover:bg-danger-soft hover:text-[var(--danger-fg)] " +
            (collapsed ? "justify-center" : "")
          }
        >
          <LogOut size={ICON.action} className="flex-none" aria-hidden="true" />
          {!collapsed && "Sair"}
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={
            "mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-body-sm font-medium text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text " +
            (collapsed ? "justify-center" : "")
          }
        >
          <ChevronLeft
            size={ICON.action}
            className={"flex-none transition-transform " + (collapsed ? "rotate-180" : "")}
            aria-hidden="true"
          />
          {!collapsed && "Recolher"}
        </button>
      </div>
    </aside>
  );
}
