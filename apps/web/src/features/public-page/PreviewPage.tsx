import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "../../components/ui/Banner";
import { fetchPreview } from "./publicApi";

/**
 * Prévia da vitrine, dentro da área logada: o corretor vê exatamente o que o
 * visitante veria, com os dados de agora, antes (ou depois) de publicar.
 * A moldura de celular deixa conferir o mobile sem sair do desktop.
 */
/** Altura de aparelho: 390x844 é o iPhone que a maioria das leads usa. */
const ALTURA_CELULAR = 844;

export function PreviewPage() {
  const [modo, setModo] = useState<"celular" | "desktop">("celular");
  const quadro = useRef<HTMLIFrameElement>(null);
  // Piso baixo de propósito: a vitrine tem `min-h-dvh`, então ela se estica
  // até a altura do quadro. Começar alto deixaria um vazio embaixo em página
  // curta; a partir daqui quem manda é o conteúdo.
  const [alturaDoConteudo, setAlturaDoConteudo] = useState(640);

  const consulta = useQuery({ queryKey: ["public-page", "preview"], queryFn: fetchPreview });

  /**
   * No modo Desktop o quadro cresce até caber a página inteira, para a rolagem
   * ser a da tela e não uma segunda rolagem dentro de uma caixa. No Celular a
   * altura é fixa de propósito: ali a caixa É o aparelho, e rolar dentro dela
   * é justamente o que se quer testar.
   */
  useEffect(() => {
    if (modo !== "desktop") return;
    const iframe = quadro.current;
    if (!iframe) return;

    let observador: ResizeObserver | null = null;
    const medir = () => {
      const doc = iframe.contentDocument;
      if (doc) setAlturaDoConteudo(doc.documentElement.scrollHeight);
    };
    const ligar = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      medir();
      // O conteúdo chega depois do load (a vitrine busca os dados), então não
      // basta medir uma vez: é preciso acompanhar o corpo crescendo.
      observador = new ResizeObserver(medir);
      observador.observe(doc.body);
    };

    iframe.addEventListener("load", ligar);
    ligar();
    return () => {
      iframe.removeEventListener("load", ligar);
      observador?.disconnect();
    };
  }, [modo]);

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

      {/* A vitrine dentro de um iframe, e não de uma div, porque media query
          responde à janela e não ao elemento: numa div de 390px no desktop os
          breakpoints de desktop continuavam valendo, e o "Celular" mostrava um
          layout largo espremido, com o nome do corretor estourando a borda. No
          iframe a janela tem a largura do aparelho de verdade. */}
      <div
        className={`overflow-hidden rounded-2xl border border-border bg-bg shadow-sm ${
          modo === "celular" ? "mx-auto w-full max-w-[390px]" : "w-full"
        }`}
      >
        <iframe
          ref={quadro}
          src="/minha-pagina/previa/quadro"
          title="Prévia da sua página"
          className="block w-full border-0"
          style={{ height: modo === "celular" ? ALTURA_CELULAR : alturaDoConteudo }}
        />
      </div>
    </div>
  );
}
