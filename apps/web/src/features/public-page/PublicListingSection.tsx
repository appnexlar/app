import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PublicPropertyCard, PublicSort } from "@nexlar/shared";
import { Select, type SelectOption } from "../../components/ui/Select";
import { useDebounced } from "../../lib/useDebounced";
import { CartaoPublico, Eyebrow } from "./BrokerStorefront";
import { fetchPublicListing } from "./publicApi";

/**
 * A seção "Imóveis" da vitrine, viva: busca, filtros essenciais, ordenação e
 * carregar mais, tudo decidido no backend. Mobile first: os controles são
 * chips e selects de um toque, não um painel de formulário.
 */

const ORDENACOES: { value: PublicSort; label: string }[] = [
  { value: "destaque", label: "Destaques primeiro" },
  { value: "recentes", label: "Mais recentes" },
  { value: "menor_preco", label: "Menor preço" },
  { value: "maior_preco", label: "Maior preço" },
  { value: "maior_area", label: "Maior área" },
];

const FINALIDADES: { value: string; label: string }[] = [
  { value: "", label: "Tudo" },
  { value: "venda", label: "Comprar" },
  { value: "locacao", label: "Alugar" },
];

/** As facetas vêm como lista de textos; o Select quer valor e rótulo. */
function comoOpcoes(valores: string[]): SelectOption[] {
  return valores.map((v) => ({ value: v, label: v }));
}

export function PublicListingSection({
  slug,
  whatsapp,
  brokerName,
}: {
  slug: string;
  whatsapp: string | null;
  brokerName: string;
}) {
  const [busca, setBusca] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [bairro, setBairro] = useState("");
  const [ordem, setOrdem] = useState<PublicSort>("destaque");
  const [paginas, setPaginas] = useState(1);

  const buscaEstavel = useDebounced(busca.trim(), 350);

  // Qualquer mudança de filtro volta para a primeira página.
  const filtros = useMemo(() => {
    return {
      q: buscaEstavel.length >= 2 ? buscaEstavel : undefined,
      purpose: finalidade || undefined,
      type: tipo || undefined,
      neighborhood: bairro || undefined,
      sort: ordem,
    };
  }, [buscaEstavel, finalidade, tipo, bairro, ordem]);
  const chaveFiltros = JSON.stringify(filtros);

  // Busca as páginas 1..N e acumula. keepPreviousData evita a lista piscar
  // enquanto o filtro novo carrega.
  const consulta = useQuery({
    queryKey: ["vitrine", slug, "imoveis", chaveFiltros, paginas],
    queryFn: async () => {
      const respostas = await Promise.all(
        Array.from({ length: paginas }, (_, i) => fetchPublicListing(slug, { ...filtros, page: i + 1 })),
      );
      const ultima = respostas[respostas.length - 1];
      return { ...ultima, items: respostas.flatMap((r) => r.items) };
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const dados = consulta.data;
  const items: PublicPropertyCard[] = dados?.items ?? [];
  const temMais = dados ? items.length < dados.total : false;
  const temFiltroAtivo = Boolean(filtros.q || finalidade || tipo || bairro);

  const mudar = <T,>(setter: (v: T) => void) => (valor: T) => {
    setter(valor);
    setPaginas(1);
  };

  return (
    <section id="imoveis" className="mt-12 scroll-mt-6 sm:mt-16">
      <Eyebrow>Imóveis</Eyebrow>
      {/* No celular a contagem desce para a linha de baixo. Ao lado do título
          ela empurrava "Selecionados para você" para duas linhas e o número
          ficava pendurado na altura da primeira, com cara de sobra. */}
      <div className="mt-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 className="text-h1 text-text sm:text-display">Selecionados para você</h2>
        {dados && (
          <span className="text-body-sm font-semibold text-text-muted sm:flex-none">
            {dados.total} {dados.total === 1 ? "imóvel" : "imóveis"}
          </span>
        )}
      </div>

      {/* Controles: busca em cima; finalidade como chips; o resto em selects. */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-subtle"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={busca}
            onChange={(e) => mudar(setBusca)(e.target.value)}
            placeholder="Buscar por bairro, tipo ou código"
            aria-label="Buscar imóveis"
            className="min-h-12 w-full rounded-md border border-border bg-surface pl-11 pr-4 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus focus-visible:outline-none"
          />
        </div>

        {/* Duas fileiras no celular e uma no desktop. Antes era um `flex-wrap`
            só, e o "Ordenar" tinha `ml-auto`: no celular ele caía sozinho numa
            terceira linha, colado na borda direita, com cara de erro de
            layout. Aqui a finalidade ocupa a largura inteira (é a escolha que
            mais muda o resultado) e os seletores dividem a linha de baixo. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-[3px] sm:inline-flex sm:flex-none"
            role="radiogroup"
            aria-label="Finalidade"
          >
            {FINALIDADES.map((f) => (
              <button
                key={f.value || "tudo"}
                type="button"
                role="radio"
                aria-checked={finalidade === f.value}
                onClick={() => mudar(setFinalidade)(f.value)}
                className={`min-h-[38px] rounded-sm px-3.5 text-body-sm font-semibold transition-colors ${
                  finalidade === f.value ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:items-center">
            {(dados?.facets.types.length ?? 0) > 1 && (
              <Select
                label="Tipo"
                hideLabel
                compact
                highlighted={Boolean(tipo)}
                value={tipo}
                placeholder="Tipo: todos"
                options={comoOpcoes(dados?.facets.types ?? [])}
                onValueChange={mudar(setTipo)}
              />
            )}
            {(dados?.facets.neighborhoods.length ?? 0) > 1 && (
              <Select
                label="Bairro"
                hideLabel
                compact
                highlighted={Boolean(bairro)}
                value={bairro}
                placeholder="Bairro: todos"
                options={comoOpcoes(dados?.facets.neighborhoods ?? [])}
                onValueChange={mudar(setBairro)}
              />
            )}

            {/* Ordenar não é filtro: nunca fica em destaque (estar preenchido é
                o normal dele) e no desktop vai para a direita, separado de quem
                restringe a lista. */}
            <Select
              label="Ordenar por"
              hideLabel
              compact
              align="right"
              value={ordem}
              options={ORDENACOES}
              onValueChange={(v) => mudar(setOrdem)(v as PublicSort)}
              className="col-span-2 sm:col-span-1 sm:ml-auto sm:w-auto"
            />
          </div>
        </div>
      </div>

      {/* Resultado, nos quatro estados. */}
      {consulta.isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2" aria-busy="true">
          <div className="h-72 animate-pulse rounded-xl bg-surface-sunken" />
          <div className="hidden h-72 animate-pulse rounded-xl bg-surface-sunken sm:block" />
        </div>
      ) : consulta.isError ? (
        <p className="mt-6 rounded-xl bg-surface px-5 py-8 text-center text-body-sm text-text-muted shadow-sm">
          Não foi possível carregar os imóveis.{" "}
          <button type="button" className="font-semibold text-accent underline" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </p>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl bg-surface px-5 py-10 text-center shadow-sm">
          <p className="text-body font-semibold text-text">Nenhum imóvel com esses filtros.</p>
          {temFiltroAtivo && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setFinalidade("");
                setTipo("");
                setBairro("");
                setPaginas(1);
              }}
              className="mt-2 text-body-sm font-semibold text-accent underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className={`mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 ${consulta.isPlaceholderData ? "opacity-60" : ""}`}>
            {items.map((p) => (
              <CartaoPublico
                key={p.code}
                property={p}
                slug={slug}
                whatsapp={whatsapp}
                brokerName={brokerName}
              />
            ))}
          </ul>
          {temMais && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setPaginas((n) => n + 1)}
                disabled={consulta.isFetching}
                className="min-h-12 rounded-md border border-border bg-surface px-8 text-body font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {consulta.isFetching ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
