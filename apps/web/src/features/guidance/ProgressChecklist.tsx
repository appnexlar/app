import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChecklistItem, GuidanceChecklist } from "@nexlar/shared";
import { useShell } from "../shell/ShellContext";

/**
 * Checklist de primeiros passos (§8). Concluído só por ação real: o corretor
 * nunca marca à mão. Pode ser minimizado, porque orientação não bloqueia nada.
 * Item pendente é um botão: toca e cai direto onde o passo acontece.
 */
export function ProgressChecklist({ checklist }: { checklist: GuidanceChecklist }) {
  const [aberto, setAberto] = useState(true);
  const navigate = useNavigate();
  const { openNewLead } = useShell();
  const pct = Math.round((checklist.completed / checklist.total) * 100);

  function agir(item: ChecklistItem) {
    if (item.actionType === "abrir-novo-lead") {
      openNewLead();
      return;
    }
    if (item.actionUrl) navigate(item.actionUrl);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 text-text">Primeiros passos</h3>
          <p className="mt-0.5 text-body-sm text-text-muted">
            {checklist.completed} de {checklist.total} concluídos
          </p>
        </div>
        <span className="text-body-sm font-bold tabular-nums text-text">{pct}%</span>
        <svg
          className={`h-5 w-5 flex-none text-text-subtle transition-transform duration-base ${aberto ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="px-5 pb-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-base"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {aberto && (
        <ul className="divide-y divide-border px-1 pb-2 pt-1">
          {checklist.items.map((item) => {
            const clicavel =
              !item.done && !item.indisponivel && (item.actionUrl || item.actionType);
            return (
              <li key={item.key}>
                {clicavel ? (
                  <button
                    type="button"
                    onClick={() => agir(item)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:bg-surface-sunken"
                  >
                    <Marcador done={false} indisponivel={item.indisponivel} />
                    <span className="flex-1 text-body-sm text-text group-hover:text-accent">
                      {item.title}
                    </span>
                    <svg
                      className="h-4 w-4 flex-none text-text-subtle"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Marcador done={item.done} indisponivel={item.indisponivel} />
                    <span
                      className={
                        "flex-1 text-body-sm " +
                        (item.done ? "text-text-muted line-through" : "text-text")
                      }
                    >
                      {item.title}
                    </span>
                    {item.indisponivel && !item.done && (
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-semibold text-text-subtle">
                        em breve
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Marcador do item: preenchido quando concluído, contorno quando pendente. */
function Marcador({ done, indisponivel }: { done: boolean; indisponivel?: boolean }) {
  if (done) {
    return (
      <span
        className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-accent-on"
        role="img"
        aria-label="Concluído"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={
        "h-6 w-6 flex-none rounded-full border-2 " +
        (indisponivel ? "border-border" : "border-border-strong")
      }
      role="img"
      aria-label="Pendente"
    />
  );
}
