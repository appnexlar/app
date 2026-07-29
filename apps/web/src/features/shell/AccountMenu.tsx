import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../../lib/name";
import { ICON } from "../../components/ui/icon";

export function AccountMenu() {
  const { broker, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-sunken focus-visible:shadow-focus"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-caption font-bold text-primary-on">
          {broker ? initials(broker.fullName) : ""}
        </span>
        <ChevronDown size={ICON.hint} className="hidden text-text-subtle sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-rise absolute right-0 top-full z-[var(--z-modal)] mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-body-sm font-semibold text-text">{broker?.fullName}</p>
            <p className="truncate text-caption text-text-muted">{broker?.email}</p>
          </div>
          <div className="p-1.5">
            <MenuItem onClick={() => go("/perfil")}>
              <User size={ICON.action} className="flex-none" aria-hidden="true" /> Meu perfil
            </MenuItem>
            <MenuItem onClick={() => go("/perfil")}>
              <Settings size={ICON.action} className="flex-none" aria-hidden="true" /> Configurações
            </MenuItem>
          </div>
          <div className="border-t border-border p-1.5">
            <MenuItem onClick={signOut} danger>
              <LogOut size={ICON.action} className="flex-none" aria-hidden="true" /> Sair
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-body-sm font-medium transition-colors " +
        (danger
          ? "text-[var(--danger-fg)] hover:bg-danger-soft"
          : "text-text hover:bg-surface-sunken")
      }
    >
      {children}
    </button>
  );
}

