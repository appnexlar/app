import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../../lib/name";

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
        <svg className="hidden h-4 w-4 text-text-subtle sm:block" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
              <IconUser /> Meu perfil
            </MenuItem>
            <MenuItem onClick={() => go("/perfil")}>
              <IconGear /> Configurações
            </MenuItem>
          </div>
          <div className="border-t border-border p-1.5">
            <MenuItem onClick={signOut} danger>
              <IconExit /> Sair
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

function IconUser() {
  return (
    <svg className="h-[18px] w-[18px] flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg className="h-[18px] w-[18px] flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5l1.4 2.2 2.6-.4 .4 2.6 2.2 1.4-1 2.4 1 2.4-2.2 1.4-.4 2.6-2.6-.4L12 20.5l-1.4-2.2-2.6.4-.4-2.6-2.2-1.4 1-2.4-1-2.4 2.2-1.4.4-2.6 2.6.4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function IconExit() {
  return (
    <svg className="h-[18px] w-[18px] flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 4.5H6a1.5 1.5 0 00-1.5 1.5v12A1.5 1.5 0 006 19.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 12H10m8.5 0l-3-3m3 3l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
