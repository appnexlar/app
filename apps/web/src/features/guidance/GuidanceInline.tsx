import { useNavigate } from "react-router-dom";
import type { GuidanceRecommendation } from "@nexlar/shared";
import { useShell } from "../shell/ShellContext";
import { useGuidanceActions, useModuleGuidance } from "./useGuidance";

/**
 * Orientação contextual dentro de um módulo (§4, §13). Uma faixa discreta no
 * topo da tela, não um card grande: reforça a próxima ação sem competir com o
 * conteúdo da página. Aparece só quando há algo relevante àquela rota.
 */
export function GuidanceInline({ prefixos }: { prefixos: string[] }) {
  const rec = useModuleGuidance(prefixos);
  const { dismiss } = useGuidanceActions();
  const { openNewLead } = useShell();
  const navigate = useNavigate();

  if (!rec) return null;

  function agir(r: GuidanceRecommendation) {
    if (r.actionType === "abrir-novo-lead") {
      openNewLead();
      return;
    }
    if (r.actionUrl) navigate(r.actionUrl);
  }

  return (
    <div className="animate-rise flex flex-col gap-3 rounded-xl border border-highlight-border bg-highlight-soft px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-highlight-strong text-highlight-fg" aria-hidden="true">
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-text">{rec.title}</p>
          <p className="text-caption text-text-muted">{rec.description}</p>
        </div>
      </div>
      <div className="flex flex-none items-center gap-1 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => agir(rec)}
          className="rounded-lg bg-accent px-3.5 py-2 text-caption font-semibold text-accent-on transition-colors hover:bg-accent-hover focus-visible:shadow-focus"
        >
          {rec.actionLabel}
        </button>
        {rec.dismissible && (
          <button
            type="button"
            onClick={() => dismiss.mutate(rec.key)}
            disabled={dismiss.isPending}
            aria-label="Dispensar orientação"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface/60 hover:text-text focus-visible:shadow-focus"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
