import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  /**
   * Mesmo indicador no período anterior. Só com ele existe direção: o número
   * sozinho não diz se 12 contas novas foi um bom período ou um mau período.
   */
  previous?: number;
  /** Uma linha de contexto abaixo do número, quando o rótulo não basta. */
  hint?: string;
  /** Destaca o cartão que abre a seção, sem inventar cor nova. */
  emphasis?: boolean;
}

/**
 * Indicador de uma linha: rótulo, número grande e, quando faz sentido, a
 * variação contra o período anterior.
 *
 * A cor da variação diz direção, não julgamento: subir cadastro é bom, e é a
 * seção que dá o sentido. Por isso o verde e o vermelho vêm sempre
 * acompanhados de seta e do número anterior, legíveis para quem não
 * distingue as duas cores.
 */
export function StatCard({ label, value, previous, hint, emphasis }: StatCardProps) {
  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (emphasis ? "border-border-strong bg-surface" : "border-border bg-surface")
      }
    >
      <p className="text-caption text-text-subtle">{label}</p>
      <p className="mt-1 text-h2 tabular-nums text-text">{value}</p>
      {previous !== undefined && <Variacao atual={value} anterior={previous} />}
      {hint && <p className="mt-1 text-caption text-text-subtle">{hint}</p>}
    </div>
  );
}

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const diferenca = atual - anterior;

  if (diferenca === 0) {
    return (
      <Linha icone={<ArrowRight size={14} aria-hidden />} cor="text-text-subtle">
        igual ao período anterior
      </Linha>
    );
  }

  const subiu = diferenca > 0;
  return (
    <Linha
      icone={
        subiu ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />
      }
      cor={subiu ? "text-[var(--success-fg)]" : "text-[var(--danger-fg)]"}
    >
      <span className="tabular-nums">
        {subiu ? "+" : ""}
        {diferenca}
      </span>{" "}
      <span className="text-text-subtle">
        contra <span className="tabular-nums">{anterior}</span> antes
      </span>
    </Linha>
  );
}

function Linha({
  icone,
  cor,
  children,
}: {
  icone: ReactNode;
  cor: string;
  children: ReactNode;
}) {
  return (
    <p className={`mt-1 flex items-center gap-1 text-caption ${cor}`}>
      {icone}
      {children}
    </p>
  );
}
