import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../../components/ui/Modal";
import { fetchHelp } from "./api";

/**
 * Central de ajuda contextual (§17). Um botão discreto e fixo que sabe em que
 * tela o corretor está e abre só o conteúdo daquela área. Some quando a tela
 * não tem ajuda cadastrada, para não oferecer uma porta que não leva a nada.
 *
 * É autocontido: lê a rota sozinho, então basta montá-lo uma vez no layout.
 */
export function ContextualHelpPanel() {
  const location = useLocation();
  const [aberto, setAberto] = useState(false);

  // Chave da ajuda = primeiro segmento da rota (/imoveis/123 -> "imoveis").
  const route = location.pathname.split("/").filter(Boolean)[0] ?? "dashboard";

  const { data } = useQuery({
    queryKey: ["help", route],
    queryFn: () => fetchHelp(route),
    staleTime: 5 * 60_000,
  });

  // Sem conteúdo para esta tela: nada de botão.
  if (!data) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Ajuda desta tela"
        className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-md transition-colors hover:bg-surface-sunken hover:text-text focus-visible:shadow-focus"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M9.5 9.3a2.5 2.5 0 014.9.7c0 1.7-2.5 2-2.5 3.5M12 17h.01"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Modal open={aberto} onClose={() => setAberto(false)} title={data.title}>
        <div className="flex flex-col divide-y divide-border">
          {data.topics.map((topico) => (
            <details key={topico.question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-body font-semibold text-text">
                {topico.question}
                <svg
                  className="h-4 w-4 flex-none text-text-subtle transition-transform group-open:rotate-180"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <p className="pb-3 text-body-sm text-text-muted">{topico.answer}</p>
            </details>
          ))}
        </div>
      </Modal>
    </>
  );
}
