import { useEffect, useRef, useState } from "react";
import type { KnownPartner } from "@nexlar/shared";
import { searchPartners } from "./api";

/**
 * Busca de corretor parceiro entre os que ESTE corretor já cadastrou antes.
 * Se encontrar, preenche nome, CRECI, WhatsApp, e-mail e imobiliária de uma
 * vez. Se não, é só continuar digitando: o nome vira o do parceiro novo.
 * A busca fica na carteira do próprio corretor, nunca em contas de terceiros.
 */
export function PartnerLookup({
  value,
  onPick,
  onType,
}: {
  value: string;
  onPick: (partner: KnownPartner) => void;
  onType: (name: string) => void;
}) {
  const [results, setResults] = useState<KnownPartner[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Busca com debounce enquanto digita (a partir de 2 letras).
  useEffect(() => {
    const term = value.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchPartners(term)
        .then((found) => {
          if (!active) return;
          setResults(found);
          setSearched(true);
          if (found.length > 0) setOpen(true);
        })
        .catch(() => active && setResults([]))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="relative" ref={ref}>
      <label htmlFor="partner-name" className="flex items-baseline justify-between gap-2 text-label text-text">
        <span>Nome do corretor</span>
        <span className="font-normal text-caption text-text-subtle">busca nos seus parceiros</span>
      </label>
      <div className="relative mt-1.5">
        <input
          id="partner-name"
          value={value}
          autoComplete="off"
          placeholder="Digite o nome para buscar ou cadastrar"
          onChange={(e) => onType(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="w-full min-h-[var(--tap-target-min)] rounded-md border border-border bg-surface px-3.5 pr-10 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-subtle">
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
              <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface py-1.5 shadow-md">
          {results.map((partner, i) => (
            <li key={`${partner.name}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(partner);
                  setOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left hover:bg-surface-sunken"
              >
                <span className="block text-body-sm font-semibold text-text">{partner.name}</span>
                <span className="block text-caption text-text-muted">
                  {[
                    partner.creci && `CRECI ${partner.creci}`,
                    partner.agencyName,
                    partner.whatsapp,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sem dados adicionais"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !loading && results.length === 0 && value.trim().length >= 2 && (
        <p className="mt-1.5 text-caption text-text-subtle">
          Nenhum parceiro seu com esse nome. Preencha os dados abaixo para cadastrá-lo.
        </p>
      )}
    </div>
  );
}
