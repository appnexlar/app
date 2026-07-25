import { useState } from "react";

/**
 * Lista de etiquetas editável (regiões, tipos, idiomas): digita, Enter ou
 * "Adicionar" inclui, o X remove. Sugestões viram atalho de um toque, pensadas
 * para o polegar no celular.
 */
export function TagListInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions = [],
  max = 12,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value || values.length >= max) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  };

  const pendentes = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-text">{label}</span>

      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-body-sm font-semibold text-accent"
            >
              {value}
              <button
                type="button"
                aria-label={`Remover ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-black/10"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={values.length >= max ? "Limite atingido" : placeholder}
          disabled={values.length >= max}
          className="min-h-[var(--tap-target-min)] w-full rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle transition-colors duration-fast focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim() || values.length >= max}
          className="min-h-[var(--tap-target-min)] flex-none rounded-md border border-border px-4 text-body-sm font-semibold text-text transition-colors hover:bg-surface-sunken disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      {pendentes.length > 0 && values.length < max && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {pendentes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-border px-2.5 py-1 text-caption font-semibold text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
