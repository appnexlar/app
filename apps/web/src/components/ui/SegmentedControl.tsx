export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** Descreve o grupo para quem navega por leitor de tela. */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Escolha única entre poucas opções curtas, no formato de trilho: o fundo
 * afundado guarda o espaço e a opção ativa sobe como uma pastilha clara.
 *
 * Serve quando as opções são um eixo contínuo (períodos, densidades) e cabem
 * todas na tela. Para muitas opções ou rótulos longos, o certo é o
 * FilterChips, que rola, ou um Select.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      // No celular ocupa a linha inteira, para os alvos de toque crescerem
      // em vez de espremerem; a partir de sm volta a ter a largura do conteúdo.
      className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-lg bg-surface-sunken p-1 sm:inline-grid sm:w-auto"
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
              // nowrap: rótulo de trilho quebrado em duas linhas desalinha a
              // fileira inteira e é o primeiro sintoma no celular.
              "whitespace-nowrap rounded-md px-2 py-1.5 text-body-sm font-semibold transition-[background-color,color,box-shadow] duration-fast ease-standard focus-visible:shadow-focus sm:px-3 " +
              (active
                ? "bg-surface text-text shadow-xs"
                : "text-text-muted hover:text-text")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
