import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManagedPropertiesResponse, ManagedProperty } from "@nexlar/shared";
import { MAX_HIGHLIGHTS } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { SearchField } from "../../components/ui/SearchField";
import { SmartEmptyState } from "../../components/ui/SmartEmptyState";
import { AuthImage } from "../properties/AuthImage";
import { ApiError } from "../../lib/http";
import {
  changeVisibility,
  fetchManagedProperties,
  publishAllProperties,
  setHighlights,
} from "./api";

/**
 * Gerenciador dos imóveis da vitrine. Não duplica o cadastro: mostra a
 * carteira que já existe e responde uma pergunta só, por imóvel: isto aparece
 * na minha página? Quando não pode, diz por quê e leva até onde se resolve.
 */

type Filtro = "todos" | "publicados" | "prontos" | "pendentes";

export function PublicPropertiesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["public-page", "imoveis"],
    queryFn: fetchManagedProperties,
  });

  const aplicar = (dados: ManagedPropertiesResponse) => {
    queryClient.setQueryData(["public-page", "imoveis"], dados);
    // A régua de publicação da página depende de ter imóvel no ar.
    void queryClient.invalidateQueries({ queryKey: ["public-page"], exact: true });
  };

  const visibilidade = useMutation({
    mutationFn: ({ id, para }: { id: string; para: "privado" | "publico" | "oculto" }) =>
      changeVisibility(id, para),
    onSuccess: () => {
      setErro(null);
      void queryClient.invalidateQueries({ queryKey: ["public-page"] });
    },
    onError: (e) =>
      setErro(
        e instanceof ApiError ? e.message : "Não foi possível alterar este imóvel agora.",
      ),
  });

  const publicarTodos = useMutation({
    mutationFn: publishAllProperties,
    onSuccess: () => {
      setErro(null);
      void queryClient.invalidateQueries({ queryKey: ["public-page"] });
    },
    onError: (e) =>
      setErro(e instanceof ApiError ? e.message : "Não foi possível publicar agora."),
  });

  const destaques = useMutation({
    mutationFn: setHighlights,
    onSuccess: (dados) => {
      setErro(null);
      aplicar(dados);
    },
    onError: (e) =>
      setErro(e instanceof ApiError ? e.message : "Não foi possível salvar os destaques."),
  });

  const dados = consulta.data;

  const emDestaque = useMemo(
    () =>
      (dados?.items ?? [])
        .filter((i) => i.highlightOrder != null)
        .sort((a, b) => (a.highlightOrder ?? 0) - (b.highlightOrder ?? 0)),
    [dados],
  );

  const listados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (dados?.items ?? []).filter((i) => {
      const passaFiltro =
        filtro === "todos" ||
        (filtro === "publicados" && i.visibility === "publico" && i.eligibility.eligible) ||
        (filtro === "prontos" && i.visibility !== "publico" && i.eligibility.eligible) ||
        (filtro === "pendentes" && !i.eligibility.eligible);
      if (!passaFiltro) return false;
      if (!termo) return true;
      return [i.title, i.city, i.neighborhood, i.type, String(i.code)]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo));
    });
  }, [dados, filtro, busca]);

  if (consulta.isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-sunken" />
        ))}
      </div>
    );
  }

  if (consulta.isError || !dados) {
    return (
      <div className="mx-auto max-w-3xl">
        <Banner variant="danger">
          Não foi possível carregar seus imóveis.{" "}
          <button type="button" className="font-semibold underline" onClick={() => consulta.refetch()}>
            Tentar de novo
          </button>
        </Banner>
      </div>
    );
  }

  if (dados.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <SmartEmptyState
          icon={
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 10.5L12 4l8 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 20v-5h4v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title="Sua carteira ainda está vazia"
          description="Cadastre um imóvel para escolher o que vai aparecer na sua página pública."
          action={{ label: "Cadastrar imóvel", onClick: () => navigate("/imoveis/novo") }}
          hint="Um imóvel disponível, com foto, cidade e tipo já entra na sua página."
        />
      </div>
    );
  }

  const { summary } = dados;

  const alternarDestaque = (item: ManagedProperty) => {
    const atuais = emDestaque.map((i) => i.id);
    if (item.highlightOrder != null) {
      destaques.mutate(atuais.filter((id) => id !== item.id));
      return;
    }
    if (atuais.length >= MAX_HIGHLIGHTS) {
      setErro(`Você já tem ${MAX_HIGHLIGHTS} destaques. Remova um para incluir outro.`);
      return;
    }
    destaques.mutate([...atuais, item.id]);
  };

  const mover = (index: number, direcao: -1 | 1) => {
    const ids = emDestaque.map((i) => i.id);
    const destino = index + direcao;
    if (destino < 0 || destino >= ids.length) return;
    [ids[index], ids[destino]] = [ids[destino], ids[index]];
    destaques.mutate(ids);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* Resumo: o corretor entende a situação da vitrine antes de agir. */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-h2 text-text">Imóveis da sua página</h2>
        <p className="mt-1 text-body-sm text-text-muted">
          Todo imóvel que você cadastra já entra aqui. Tire do ar o que não quiser divulgar.
        </p>
        {/* Os contadores SÃO os filtros: um toque no número já mostra aquele
            grupo. Antes eram duas fileiras dizendo a mesma coisa, e a de
            baixo estourava a largura do celular. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filtrar imóveis">
          <Contador
            rotulo="Todos"
            valor={dados.items.length}
            ativo={filtro === "todos"}
            onClick={() => setFiltro("todos")}
          />
          <Contador
            rotulo="Na página"
            valor={summary.publicados}
            ativo={filtro === "publicados"}
            onClick={() => setFiltro("publicados")}
          />
          <Contador
            rotulo="Fora do ar"
            valor={summary.prontos}
            ativo={filtro === "prontos"}
            onClick={() => setFiltro("prontos")}
          />
          <Contador
            rotulo="Pendências"
            valor={summary.comPendencia}
            ativo={filtro === "pendentes"}
            onClick={() => setFiltro("pendentes")}
          />
        </div>
      </section>

      {/* Carteira de antes da virada de padrão: os imóveis prontos ficaram
          fora do ar e ninguém vai abrir um por um. */}
      {summary.prontos > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-accent-soft bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-body-sm font-bold text-text">
              {summary.prontos === 1
                ? "1 imóvel pronto está fora da sua página"
                : `${summary.prontos} imóveis prontos estão fora da sua página`}
            </p>
            <p className="mt-0.5 text-body-sm text-text-muted">
              Eles têm tudo que precisa para aparecer. Você pode colocar todos de uma vez.
            </p>
          </div>
          <Button
            type="button"
            variant="accent"
            className="flex-none"
            loading={publicarTodos.isPending}
            onClick={() => publicarTodos.mutate()}
          >
            Colocar todos no ar
          </Button>
        </section>
      )}

      {erro && <Banner variant="danger">{erro}</Banner>}

      {/* Destaques: só aparece quando já existe algo publicado. */}
      {(emDestaque.length > 0 || summary.publicados > 0) && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-h3 text-text">Destaques</h3>
            <span className="text-caption text-text-subtle">
              {emDestaque.length} de {MAX_HIGHLIGHTS}
            </span>
          </div>
          <p className="mt-0.5 text-body-sm text-text-muted">
            Os primeiros imóveis que o visitante vê, na ordem que você definir.
          </p>

          {emDestaque.length === 0 ? (
            <p className="mt-4 rounded-md bg-surface-sunken px-3.5 py-3 text-body-sm text-text-muted">
              Nenhum destaque ainda. Use a estrela nos imóveis da lista abaixo.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {emDestaque.map((item, i) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-caption font-bold text-accent-on">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text">
                    {item.title}
                  </span>
                  <div className="flex flex-none gap-1">
                    <BotaoIcone
                      label="Subir"
                      disabled={i === 0 || destaques.isPending}
                      onClick={() => mover(i, -1)}
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </BotaoIcone>
                    <BotaoIcone
                      label="Descer"
                      disabled={i === emDestaque.length - 1 || destaques.isPending}
                      onClick={() => mover(i, 1)}
                    >
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </BotaoIcone>
                    <BotaoIcone
                      label={`Remover ${item.title} dos destaques`}
                      disabled={destaques.isPending}
                      onClick={() => alternarDestaque(item)}
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </BotaoIcone>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Busca. O filtro já está nos contadores acima. */}
      <SearchField
        value={busca}
        onChange={setBusca}
        placeholder="Buscar por título, bairro ou código"
        label="Buscar imóveis"
      />

      {/* Lista. */}
      {listados.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-8 text-center text-body-sm text-text-muted">
          Nenhum imóvel encontrado com esse filtro.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {listados.map((item) => (
            <CartaoImovel
              key={item.id}
              item={item}
              ocupado={visibilidade.isPending || destaques.isPending}
              onVisibilidade={(para) => visibilidade.mutate({ id: item.id, para })}
              onDestaque={() => alternarDestaque(item)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Número e rótulo que também filtram a lista. Zero fica apagado: não há o que ver ali. */
function Contador({
  rotulo,
  valor,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-fast ${
        ativo
          ? "border-accent bg-accent-soft"
          : "border-transparent bg-surface-sunken hover:border-border"
      }`}
    >
      <span
        className={`block text-h2 tabular-nums ${
          ativo ? "text-accent" : valor === 0 ? "text-text-subtle" : "text-text"
        }`}
      >
        {valor}
      </span>
      <span
        className={`block text-caption ${ativo ? "font-semibold text-accent" : "text-text-muted"}`}
      >
        {rotulo}
      </span>
    </button>
  );
}

function BotaoIcone({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-35"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function CartaoImovel({
  item,
  ocupado,
  onVisibilidade,
  onDestaque,
}: {
  item: ManagedProperty;
  ocupado: boolean;
  onVisibilidade: (para: "privado" | "publico" | "oculto") => void;
  onDestaque: () => void;
}) {
  const publicado = item.visibility === "publico" && item.eligibility.eligible;
  const local = [item.neighborhood, item.city].filter(Boolean).join(", ");

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex gap-3 p-3 sm:p-4">
        {/* Capa. */}
        <div className="h-20 w-20 flex-none overflow-hidden rounded-md bg-surface-sunken sm:h-24 sm:w-24">
          {item.coverUrl ? (
            <AuthImage src={item.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-subtle">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 15l4.5-4.5L12 15l3-3 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/imoveis/${item.code}`}
              className="min-w-0 text-body-sm font-semibold text-text hover:text-accent"
            >
              {item.title}
            </Link>
            {publicado && (
              <button
                type="button"
                aria-label={
                  item.highlightOrder != null ? "Remover dos destaques" : "Colocar em destaque"
                }
                aria-pressed={item.highlightOrder != null}
                disabled={ocupado}
                onClick={onDestaque}
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
                  item.highlightOrder != null
                    ? "text-warning"
                    : "text-text-subtle hover:text-warning"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill={item.highlightOrder != null ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
                </svg>
              </button>
            )}
          </div>

          <p className="truncate text-caption text-text-muted">
            {item.type}
            {local && ` · ${local}`} · #{item.code}
          </p>
          <p className="text-body-sm font-semibold text-text">{item.priceLabel}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Selo item={item} />
          </div>
        </div>
      </div>

      {/* Pendências: dizem o que falta e levam até onde se resolve. */}
      {!item.eligibility.eligible && (
        <ul className="flex flex-col gap-1 border-t border-border bg-warning-soft px-3 py-2.5 sm:px-4">
          {item.eligibility.reasons.map((r) => (
            <li key={r.code} className="flex items-center justify-between gap-3">
              <span className="text-caption text-warning-fg">{r.message}</span>
              {r.actionUrl && (
                <Link
                  to={r.actionUrl}
                  className="flex-none text-caption font-bold text-warning-fg underline"
                >
                  Resolver
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Ações. */}
      {item.eligibility.eligible && (
        <div className="flex gap-2 border-t border-border px-3 py-2.5 sm:px-4">
          {publicado ? (
            <Button
              type="button"
              variant="ghost"
              disabled={ocupado}
              onClick={() => onVisibilidade("oculto")}
            >
              Tirar da página
            </Button>
          ) : (
            <Button
              type="button"
              variant="accent"
              disabled={ocupado}
              onClick={() => onVisibilidade("publico")}
            >
              Publicar na página
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Estado da exposição, com forma e texto (não só cor). */
function Selo({ item }: { item: ManagedProperty }) {
  if (!item.eligibility.eligible) {
    return (
      <span className="rounded-full bg-warning-soft px-2.5 py-1 text-caption font-bold text-warning-fg">
        Pendência
      </span>
    );
  }
  if (item.visibility === "publico") {
    return (
      <span className="rounded-full bg-success-soft px-2.5 py-1 text-caption font-bold text-[var(--success-fg)]">
        Na página
      </span>
    );
  }
  return (
    <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-caption font-bold text-text-muted">
      Fora da página
    </span>
  );
}
