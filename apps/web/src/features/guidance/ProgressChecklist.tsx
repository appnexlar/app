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
  const pct = Math.round((checklist.completed / checklist.total) * 100);
  const faltam = checklist.total - checklist.completed;
  // O próximo passo real: o primeiro pendente que já dá para fazer.
  const proximo = checklist.items.find((i) => !i.done && !i.indisponivel);
  // Quem já andou a maior parte do caminho não precisa ver sete itens riscados
  // ocupando a primeira dobra: entra recolhido, mostrando só o que falta.
  const [aberto, setAberto] = useState(pct < 70);
  const navigate = useNavigate();
  const { openNewLead } = useShell();

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
        className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken sm:px-6"
      >
        {/* Anel de progresso: diz a mesma coisa que a porcentagem, sem gastar
            uma linha de texto para isso. */}
        <Anel pct={pct} />
        <div className="min-w-0 flex-1">
          {/* Rótulo de seção, não título de página: este bloco é apoio, e não
              pode disputar peso com o que os clientes fizeram. */}
          <p className="text-label text-text">Primeiros passos</p>
          <p className="mt-1 line-clamp-2 text-body-sm text-text-muted">
            {faltam === 0
              ? "Tudo concluído. Boa!"
              : proximo
                ? `Falta${faltam > 1 ? "m" : ""} ${faltam}. A próxima: ${proximo.title.toLowerCase()}`
                : `Falta${faltam > 1 ? "m" : ""} ${faltam} ${faltam > 1 ? "passos" : "passo"}`}
          </p>
        </div>
        <svg
          className={`h-6 w-6 flex-none text-text-subtle transition-transform duration-base ${aberto ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

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
                    className="group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:bg-surface-sunken"
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
                  <div className="flex items-center gap-4 px-4 py-4">
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
                      <span className="rounded-full bg-surface-sunken px-2 py-1 text-caption font-semibold text-text-subtle">
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

/**
 * Anel de progresso de 40px. Ocupa o lugar do ícone da linha e substitui a
 * porcentagem escrita: quem quer o número exato abre o checklist.
 */
function Anel({ pct }: { pct: number }) {
  const raio = 16;
  const volta = 2 * Math.PI * raio;
  return (
    <span className="relative flex h-10 w-10 flex-none items-center justify-center" role="img" aria-label={`${pct}% concluído`}>
      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={raio} fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={raio}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-base"
        />
      </svg>
      <span className="absolute text-caption font-bold tabular-nums text-text">{pct}</span>
    </span>
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
