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
 * Vai pondo as barras conforme se digita, e nunca deixa passar de oito
 * dígitos. Quem digita "20082026" vê "20/08/2026" sem tocar em barra nenhuma,
 * e quem digita as barras também funciona: elas são descartadas na entrada.
 */
function mascarar(bruto: string): string {
  const d = bruto.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * "DD/MM/AAAA" digitado para ISO, ou null se a data não existe.
 *
 * Confere o calendário de verdade, e não só o formato: 31/02 tem oito dígitos
 * e mesmo assim não é um dia. O Date normalizaria para 03/03 em silêncio, o
 * que faria o campo aceitar uma data que a pessoa não escolheu.
 */
function paraISO(texto: string, minYear: number, maxYear: number): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const dia = Number(dd);
  const mes = Number(mm);
  const ano = Number(aaaa);
  if (mes < 1 || mes > 12) return null;
  if (ano < minYear || ano > maxYear) return null;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  if (dia < 1 || dia > ultimoDia) return null;
  return `${aaaa}-${pad(mes)}-${pad(dia)}`;
}

/**
 * Seletor de data no Design System do Nextlar. Calendário em painel que expande
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
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const today = new Date();
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const initial = selected ? selected.split("-").map(Number) : null;

  const [viewYear, setViewYear] = useState(initial ? initial[0] : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial ? initial[1] - 1 : today.getMonth());

  // O que está escrito no campo. Existe separado do `value` porque durante a
  // digitação ("20/08/20…") ainda não há data nenhuma para avisar ao pai.
  const [texto, setTexto] = useState(() => display(value));
  const [erroDeDigitacao, setErroDeDigitacao] = useState<string | null>(null);

  // O último valor que ESTE campo avisou ao formulário. Serve para saber, no
  // efeito abaixo, se o `value` que chegou é notícia de fora ou o eco da
  // própria digitação.
  const ecoDaDigitacao = useRef<string | null>(null);

  // Data escolhida por fora (calendário, "Hoje", "Limpar", ou o formulário
  // preenchido a partir de um rascunho) reescreve o campo.
  //
  // O eco precisa ser ignorado: quem digita "31/02" faz o valor voltar vazio,
  // e reescrever o campo a partir dele apagaria o que a pessoa acabou de
  // escrever, no meio da digitação.
  useEffect(() => {
    if (value === ecoDaDigitacao.current) return;
    setTexto(display(value));
    setErroDeDigitacao(null);
  }, [value]);

  function digitar(bruto: string) {
    const mascarado = mascarar(bruto);
    setTexto(mascarado);
    setErroDeDigitacao(null);

    if (mascarado === "") {
      if (value) {
        ecoDaDigitacao.current = "";
        onChange("");
      }
      return;
    }
    const iso = paraISO(mascarado, minYear, maxYear);
    // Só avisa o formulário quando a data existe de verdade. Enquanto está
    // pela metade, o campo guarda o texto e o valor de fora não muda.
    if (iso) {
      ecoDaDigitacao.current = iso;
      onChange(iso);
      const [a, m] = iso.split("-").map(Number);
      setViewYear(a);
      setViewMonth(m - 1);
    } else if (value) {
      // Data pela metade ou inexistente não é data: o formulário fica sem
      // valor, mas o texto continua na tela para a pessoa terminar de digitar.
      ecoDaDigitacao.current = "";
      onChange("");
    }
  }

  /** Ao sair do campo, data pela metade ou inexistente precisa ser dita. */
  function conferirAoSair() {
    if (texto === "") return;
    if (paraISO(texto, minYear, maxYear)) return;
    setErroDeDigitacao(
      texto.replace(/\D/g, "").length < 8
        ? "Data incompleta. Use DD/MM/AAAA."
        : "Esta data não existe.",
    );
  }

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

  // Erro de quem digitou e erro que o formulário mandou dizem a mesma coisa
  // para quem lê: o campo está errado. O de digitação vem primeiro porque é
  // sobre o que a pessoa acabou de fazer.
  const mensagemDeErro = erroDeDigitacao ?? error;
  const invalido = Boolean(mensagemDeErro);

  function pick(day: number) {
    ecoDaDigitacao.current = null;
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

      {/* Digitar é o caminho mais rápido para quem já sabe a data; o
          calendário serve para escolher, comparar dia da semana e navegar.
          Os dois caminhos convivem no mesmo campo. */}
      <div
        className={
          "flex min-h-[var(--tap-target-min)] w-full items-center rounded-md border bg-surface pr-1 transition-colors duration-fast focus-within:border-[var(--border-focus)] focus-within:shadow-focus " +
          (invalido ? "border-danger" : "border-border")
        }
      >
        <input
          id={id}
          type="text"
          value={texto}
          onChange={(e) => digitar(e.target.value)}
          onBlur={conferirAoSair}
          placeholder="DD/MM/AAAA"
          // Teclado numérico no celular, sem trocar para o modo de texto.
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={invalido}
          aria-describedby={invalido ? errorId : undefined}
          className="min-w-0 flex-1 bg-transparent px-4 text-body tabular-nums text-text placeholder:text-text-subtle focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar calendário" : "Abrir calendário"}
          aria-expanded={open}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text focus-visible:shadow-focus"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3.5 9h17M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

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
                ecoDaDigitacao.current = null;
                onChange("");
                setOpen(false);
              }}
              className="px-1 text-body-sm font-medium text-text-muted hover:text-text"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                ecoDaDigitacao.current = null;
                onChange(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
              }}
              className="px-1 text-body-sm font-semibold text-accent hover:underline"
            >
              Hoje
            </button>
          </div>
        </div>
      )}

      {invalido ? (
        <p id={errorId} className="text-caption text-[var(--danger-fg)]">{mensagemDeErro}</p>
      ) : (
        hint && <p className="text-caption text-text-subtle">{hint}</p>
      )}
    </div>
  );
}
