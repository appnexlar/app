import type { ReactNode } from "react";
import type { GuidanceCategory, GuidanceRecommendation } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";

/**
 * Cartão de recomendação: a orientação principal em destaque, uma por vez
 * (§11). A categoria é sinalizada por ícone e por texto, nunca só por cor
 * (§18), para funcionar em daltonismo e em leitor de tela.
 */

interface CategoriaVisual {
  rotulo: string;
  container: string;
  selo: string;
  icone: ReactNode;
}

const CATEGORIAS: Record<GuidanceCategory, CategoriaVisual> = {
  critical: {
    rotulo: "Atenção agora",
    container: "border-danger bg-danger-soft",
    selo: "bg-danger text-white",
    icone: (
      <path
        d="M12 3l9 16H3l9-16zM12 10v4M12 17.5v.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  operational: {
    rotulo: "Seu dia",
    container: "border-highlight-border bg-highlight-soft",
    selo: "bg-highlight-strong text-highlight-fg",
    icone: (
      <>
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v4.2l2.8 1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  educational: {
    rotulo: "Dica",
    container: "border-accent-soft bg-accent-soft",
    selo: "bg-accent text-accent-on",
    icone: (
      <path
        d="M12 2.5l1.9 5.4a2 2 0 001.2 1.2l5.4 1.9-5.4 1.9a2 2 0 00-1.2 1.2L12 19.5l-1.9-5.4a2 2 0 00-1.2-1.2L3.5 11l5.4-1.9a2 2 0 001.2-1.2L12 2.5z"
        fill="currentColor"
      />
    ),
  },
};

export function GuidanceCard({
  rec,
  onAction,
  onDismiss,
  busy = false,
}: {
  rec: GuidanceRecommendation;
  onAction: (rec: GuidanceRecommendation) => void;
  onDismiss?: (rec: GuidanceRecommendation) => void;
  busy?: boolean;
}) {
  const visual = CATEGORIAS[rec.type];

  return (
    <div
      className={`animate-rise relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-6 ${visual.container}`}
    >
      {rec.dismissible && onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(rec)}
          disabled={busy}
          aria-label="Dispensar orientação"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface/60 hover:text-text focus-visible:shadow-focus"
        >
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <div className="flex items-start gap-4">
        <span
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl ${visual.selo}`}
          aria-hidden="true"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
            {visual.icone}
          </svg>
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
            {visual.rotulo}
          </span>
          <h3 className="mt-1 text-h3 text-text text-balance">{rec.title}</h3>
          <p className="mt-1 text-body-sm text-text-muted">{rec.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="accent" onClick={() => onAction(rec)} loading={busy}>
              {rec.actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
