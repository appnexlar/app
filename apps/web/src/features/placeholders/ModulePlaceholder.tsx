import type { LucideIcon } from "lucide-react";
import { Button } from "../../components/ui/Button";

export interface ModuleContent {
  /** Descrição curta do módulo, abaixo do título (que vem do cabeçalho). */
  description: string;
  /** Mesmo ícone do módulo no menu, em tamanho de ilustração. */
  icon: LucideIcon | null;
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
}

/**
 * Estado inicial consistente de um módulo ainda não implementado.
 * Explica para que a área serve e qual será a ação principal, em vez de um
 * genérico "em construção".
 */
export function ModulePlaceholder({ content }: { content: ModuleContent }) {
  const Icone = content.icon;
  return (
    <div className="mx-auto flex max-w-xl flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-text-subtle">
          Em breve
        </span>
      </div>
      <p className="text-body text-text-muted">{content.description}</p>

      <section className="animate-rise mt-6 flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-xs">
          {Icone && <Icone size={32} aria-hidden="true" />}
        </div>
        <h2 className="mt-5 text-h2 text-text">{content.emptyTitle}</h2>
        <p className="mt-2 max-w-sm text-body text-text-muted">{content.emptyDescription}</p>
        <Button variant="accent" type="button" className="mt-6" disabled>
          {content.actionLabel}
        </Button>
        <p className="mt-3 text-caption text-text-subtle">
          Este módulo será desenvolvido nas próximas etapas.
        </p>
      </section>
    </div>
  );
}
