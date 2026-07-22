import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../../lib/name";
import { NAV_GROUPS } from "./navigation";

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { broker, signOut } = useAuth();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] lg:hidden">
      <div className="absolute inset-0 bg-[var(--overlay)] animate-[fade_0.2s_ease]" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 flex h-[100dvh] w-[84%] max-w-xs flex-col bg-surface shadow-lg">
        {/* Identidade do corretor. */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-body-sm font-bold text-primary-on">
            {broker ? initials(broker.fullName) : ""}
          </span>
          <div className="min-w-0">
            <p className="truncate text-body-sm font-semibold text-text">{broker?.fullName}</p>
            <p className="truncate text-caption text-text-muted">{broker?.email}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="mb-1 px-3 text-caption font-semibold uppercase tracking-wide text-text-subtle">
                {group.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        "flex min-h-[var(--tap-target-min)] items-center gap-3 rounded-lg px-3 text-body font-semibold transition-colors " +
                        (isActive
                          ? "bg-primary-soft text-primary"
                          : "text-text-muted hover:bg-surface-sunken hover:text-text")
                      }
                    >
                      <svg className="h-[22px] w-[22px] flex-none" viewBox="0 0 24 24" aria-hidden="true">
                        {item.icon}
                      </svg>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-[var(--tap-target-min)] w-full items-center gap-3 rounded-lg px-3 text-body font-semibold text-[var(--danger-fg)] transition-colors hover:bg-danger-soft"
          >
            <svg className="h-[22px] w-[22px] flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 4.5H6a1.5 1.5 0 00-1.5 1.5v12A1.5 1.5 0 006 19.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18.5 12H10m8.5 0l-3-3m3 3l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
