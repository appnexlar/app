import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "../../components/ui/Banner";
import { BrokerStorefront } from "./BrokerStorefront";
import { fetchPreview } from "./publicApi";

/**
 * Prévia da vitrine, dentro da área logada: o corretor vê exatamente o que o
 * visitante veria, com os dados de agora, antes (ou depois) de publicar.
 * A moldura de celular deixa conferir o mobile sem sair do desktop.
 */
export function PreviewPage() {
  const [modo, setModo] = useState<"celular" | "desktop">("celular");

  const consulta = useQuery({ queryKey: ["public-page", "preview"], queryFn: fetchPreview });

  if (consulta.isLoading) {
    return (
      <div className="mx-auto max-w-3xl" aria-busy="true">
        <div className="h-[70vh] animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  if (consulta.isError || !consulta.data?.page) {
    return (
      <div className="mx-auto max-w-2xl">
        <Banner variant="danger">
          Não foi possível montar a prévia.{" "}
          <button type="button" className="font-semibold underline" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </Banner>
      </div>
    );
  }

  const { page } = consulta.data;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {/* Faixa que deixa claro: isto é um ensaio, não a página no ar. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-h3 text-text">Prévia da sua página</h2>
          <p className="text-body-sm text-text-muted">
            É assim que os visitantes vão ver. Nada aqui foi publicado ainda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* A moldura só faz sentido em tela larga; no celular já É o celular. */}
          <div className="hidden gap-1 rounded-md bg-surface-sunken p-1 sm:flex" role="radiogroup" aria-label="Tamanho da prévia">
            {(
              [
                ["celular", "Celular"],
                ["desktop", "Desktop"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={modo === valor}
                onClick={() => setModo(valor)}
                className={`min-h-[36px] rounded-[6px] px-3 text-body-sm font-semibold transition-colors ${
                  modo === valor ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Link
            to="/minha-pagina"
            className="text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
          >
            Voltar à edição
          </Link>
        </div>
      </div>

      {/* A vitrine em si, na moldura escolhida. */}
      <div
        className={`overflow-hidden rounded-2xl border border-border shadow-sm ${
          modo === "celular" ? "mx-auto w-full max-w-[400px]" : "w-full"
        }`}
      >
        <BrokerStorefront page={page} interactive={false} />
      </div>
    </div>
  );
}
