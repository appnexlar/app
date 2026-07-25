import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PublicPropertyCard, PublicSort } from "@nexlar/shared";
import { useDebounced } from "../../lib/useDebounced";
import { CartaoPublico, Eyebrow } from "./BrokerStorefront";
import { fetchPublicListing } from "./publicApi";

/**
 * A seção "Imóveis" da vitrine, viva: busca, filtros essenciais, ordenação e
 * carregar mais, tudo decidido no backend. Mobile first: os controles são
 * chips e selects de um toque, não um painel de formulário.
 */

const ORDENACOES: { valor: PublicSort; rotulo: string }[] = [
  { valor: "destaque", rotulo: "Destaques primeiro" },
  { valor: "recentes", rotulo: "Mais recentes" },
  { valor: "menor_preco", rotulo: "Menor preço" },
  { valor: "maior_preco", rotulo: "Maior preço" },
  { valor: "maior_area", rotulo: "Maior área" },
];

const FINALIDADES: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Tudo" },
  { valor: "venda", rotulo: "Comprar" },
  { valor: "locacao", rotulo: "Alugar" },
];

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
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <h2 className="text-display text-text">Selecionados para você</h2>
        {dados && (
          <span className="flex-none text-body-sm font-semibold text-text-muted">
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
            className="min-h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-body text-text placeholder:text-text-subtle focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus focus-visible:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md bg-surface-sunken p-1" role="radiogroup" aria-label="Finalidade">
            {FINALIDADES.map((f) => (
              <button
                key={f.valor}
                type="button"
                role="radio"
                aria-checked={finalidade === f.valor}
                onClick={() => mudar(setFinalidade)(f.valor)}
                className={`min-h-[38px] rounded-[6px] px-3.5 text-body-sm font-semibold transition-colors ${
                  finalidade === f.valor ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                }`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          {(dados?.facets.types.length ?? 0) > 1 && (
            <SelectFiltro
              rotulo="Tipo"
              valor={tipo}
              opcoes={dados?.facets.types ?? []}
              onChange={mudar(setTipo)}
            />
          )}
          {(dados?.facets.neighborhoods.length ?? 0) > 1 && (
            <SelectFiltro
              rotulo="Bairro"
              valor={bairro}
              opcoes={dados?.facets.neighborhoods ?? []}
              onChange={mudar(setBairro)}
            />
          )}

          <select
            value={ordem}
            onChange={(e) => mudar(setOrdem)(e.target.value as PublicSort)}
            aria-label="Ordenar por"
            className="ml-auto min-h-[38px] rounded-md border border-border bg-surface px-2.5 text-body-sm font-semibold text-text-muted focus-visible:shadow-focus focus-visible:outline-none"
          >
            {ORDENACOES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
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
                className="min-h-12 rounded-xl border border-border bg-surface px-8 text-body font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
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

function SelectFiltro({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      aria-label={rotulo}
      className={`min-h-[38px] max-w-[46vw] truncate rounded-md border px-2.5 text-body-sm font-semibold focus-visible:shadow-focus focus-visible:outline-none ${
        valor ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-text-muted"
      }`}
    >
      <option value="">{rotulo}: todos</option>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
