export interface FilterChip<T extends string> {
  value: T;
  label: string;
  /**
   * Quantidade de itens nessa faixa. Só faz sentido quando a lista inteira está
   * na mão; com filtro no servidor fica de fora e o chip aparece sem número.
   */
  count?: number;
}

interface FilterChipsProps<T extends string> {
  label: string;
  options: FilterChip<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Faixa de filtros rápidos, uma escolha por vez. Rola na horizontal no celular
 * sem empurrar a página, como a barra de categorias de um app.
 */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-body-sm font-semibold transition-[background-color,border-color,color] duration-fast ease-standard focus-visible:shadow-focus " +
              (active
                ? "border-accent bg-accent text-accent-on"
                : "border-border bg-surface text-text-muted hover:border-border-strong hover:text-text")
            }
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={"tabular-nums " + (active ? "text-accent-on/70" : "text-text-subtle")}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
