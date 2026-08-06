import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Select } from "./Select";

interface DatePickerProps {
  label: string;
  /** Valor em ISO curto (AAAA-MM-DD) ou "" quando vazio. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  optionalLabel?: string;
  /** Primeiro ano do seletor (padrão 1920). */
  minYear?: number;
  /** Último ano do seletor (padrão ano atual + 5). */
  maxYear?: number;
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Os meses vivem em minúsculo para uso em frase; no seletor abrem em maiúscula. */
function comInicialMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "AAAA-MM-DD" para exibição "DD/MM/AAAA". */
function display(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Seletor de data no Design System do Nexlar. Calendário em painel que expande
 * abaixo do campo (funciona dentro de modais com scroll, sem ser cortado). Tem
 * troca rápida de mês e ano, o que torna prático até data de nascimento.
 */
export function DatePicker({
  label,
  value,
  onChange,
  error,
  hint,
  optionalLabel,
  minYear = 1920,
  maxYear = new Date().getFullYear() + 5,
}: DatePickerProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = Boolean(error);
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const today = new Date();
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const initial = selected ? selected.split("-").map(Number) : null;

  const [viewYear, setViewYear] = useState(initial ? initial[0] : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial ? initial[1] - 1 : today.getMonth());

  // Ao abrir, posiciona a visão no mês da data escolhida (ou hoje).
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setViewYear(initial[0]);
      setViewMonth(initial[1] - 1);
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [viewYear, viewMonth]);

  function pick(day: number) {
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const isToday = (day: number) =>
    viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
  const isSelected = (day: number) =>
    selected === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;

  return (
    <div className="flex flex-col gap-2" ref={ref}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-label text-text">
        <span>{label}</span>
        {optionalLabel && (
          <span className="font-normal text-caption text-text-subtle">{optionalLabel}</span>
        )}
      </label>

      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        aria-expanded={open}
        className={
          "flex min-h-[var(--tap-target-min)] w-full items-center justify-between rounded-md border bg-surface px-4 text-body transition-colors duration-fast focus-visible:shadow-focus focus-visible:border-[var(--border-focus)] " +
          (invalid ? "border-danger " : "border-border ") +
          (value ? "text-text" : "text-text-subtle")
        }
      >
        <span>{value ? display(value) : "DD/MM/AAAA"}</span>
        <svg className="h-5 w-5 shrink-0 text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 9h17M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="w-full max-w-[320px] rounded-xl border border-border bg-surface p-4 shadow-md">
          {/* Navegação: mês e ano com troca rápida */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex flex-1 gap-2">
              <Select
                label="Mês"
                hideLabel
                compact
                value={String(viewMonth)}
                options={MONTHS.map((m, i) => ({ value: String(i), label: comInicialMaiuscula(m) }))}
                onValueChange={(v) => setViewMonth(Number(v))}
                className="min-w-0 flex-1"
              />
              <Select
                label="Ano"
                hideLabel
                compact
                align="right"
                value={String(viewYear)}
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
                onValueChange={(v) => setViewYear(Number(v))}
                className="w-[92px] flex-none"
              />
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Dias da semana */}
          <div className="mt-4 grid grid-cols-7 text-center text-caption font-medium text-text-subtle">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="py-1">{w}</span>
            ))}
          </div>

          {/* Grade de dias */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) =>
              day == null ? (
                <span key={`e${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className={
                    "flex h-9 items-center justify-center rounded-full text-body-sm tabular-nums transition-colors " +
                    (isSelected(day)
                      ? "bg-accent font-semibold text-accent-on"
                      : isToday(day)
                        ? "font-semibold text-accent ring-1 ring-inset ring-accent"
                        : "text-text hover:bg-surface-sunken")
                  }
                >
                  {day}
                </button>
              ),
            )}
          </div>

          {/* Ações */}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="px-1 text-body-sm font-medium text-text-muted hover:text-text"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`)
              }
              className="px-1 text-body-sm font-semibold text-accent hover:underline"
            >
              Hoje
            </button>
          </div>
        </div>
      )}

      {invalid ? (
        <p id={errorId} className="text-caption text-[var(--danger-fg)]">{error}</p>
      ) : (
        hint && <p className="text-caption text-text-subtle">{hint}</p>
      )}
    </div>
  );
}
