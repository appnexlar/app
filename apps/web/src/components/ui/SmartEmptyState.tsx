import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * Estado vazio inteligente (§14 da Jornada 2). Um padrão único para todas as
 * listas: em vez de "nenhum item", explica o que aquela área representa, por
 * que é útil e qual a próxima ação. Um corretor novo começa com tudo vazio,
 * então cada vazio é uma oportunidade de ensinar, não um beco sem saída.
 *
 * A ação é sempre um onClick: quem navega passa `() => navigate(...)`, quem
 * abre um modal passa o próprio handler. Mantém o componente sem acoplamento
 * com o roteador.
 */

interface AcaoEmptyState {
  label: string;
  onClick: () => void;
}

export function SmartEmptyState({
  icon,
  title,
  description,
  action,
  help,
  hint,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: AcaoEmptyState;
  /** Ação secundária, de menor peso (ex.: "Entender como funciona"). */
  help?: AcaoEmptyState;
  /** Linha curta de reforço abaixo da ação (ex.: o que é obrigatório). */
  hint?: string;
}) {
  return (
    <section className="animate-rise mx-auto mt-4 flex max-w-xl flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </div>
      <h2 className="mt-5 text-h2 text-text text-balance">{title}</h2>
      <p className="mt-2 max-w-sm text-body text-text-muted">{description}</p>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Acao acao={action} variant="accent" />
        {help && <Acao acao={help} variant="ghost" />}
      </div>

      {hint && <p className="mt-3 text-caption text-text-subtle">{hint}</p>}
    </section>
  );
}

function Acao({ acao, variant }: { acao: AcaoEmptyState; variant: "accent" | "ghost" }) {
  return (
    <Button type="button" variant={variant} onClick={acao.onClick}>
      {acao.label}
    </Button>
  );
}
