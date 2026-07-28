/**
 * Paginação numerada. Com carteira grande, "Anterior/Próxima" vira um beco:
 * o corretor não sabe onde está nem consegue pular. Aqui ele vê a posição e
 * salta direto para qualquer página.
 *
 * A janela nunca passa de sete números, então cabe no celular; se faltar
 * largura, a barra quebra linha em vez de esconder página. Esconder número no
 * meio faria "1 4" parecer que as páginas 2 e 3 não existem.
 */

type Slot = number | "gap";

/** Primeira, última, atual e vizinhas; reticências onde há buraco. */
function slots(page: number, total: number): Slot[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out: Slot[] = [1];
  const inicio = Math.max(2, page - 1);
  const fim = Math.min(total - 1, page + 1);

  if (inicio > 2) out.push("gap");
  for (let p = inicio; p <= fim; p++) out.push(p);
  if (fim < total - 1) out.push("gap");
  out.push(total);

  return out;
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Compacto no celular para a janela inteira (até 7 números mais as setas)
  // caber numa linha só a 375px; folgado a partir de sm.
  const botao =
    "flex h-9 min-w-[36px] items-center justify-center rounded-lg px-1.5 text-body-sm tabular-nums " +
    "transition-colors duration-fast disabled:opacity-40 sm:h-10 sm:min-w-[40px] sm:px-2";

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5"
    >
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`${botao} text-text-muted hover:bg-surface-sunken hover:text-text`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {slots(page, totalPages).map((slot, i) =>
        slot === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="flex h-9 w-4 items-center justify-center text-text-subtle sm:h-10 sm:w-6"
          >
            …
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            aria-label={`Página ${slot}`}
            aria-current={slot === page ? "page" : undefined}
            onClick={() => onChange(slot)}
            className={
              `${botao} ` +
              (slot === page
                ? "bg-accent font-bold text-accent-on"
                : "font-medium text-text hover:bg-surface-sunken")
            }
          >
            {slot}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label="Próxima página"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={`${botao} text-text-muted hover:bg-surface-sunken hover:text-text`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </nav>
  );
}
