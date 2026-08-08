import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PROPERTY_CATEGORIES,
  PROPERTY_ORIGINS,
  PROPERTY_PURPOSES,
  PROPERTY_SORTS,
  PROPERTY_STATUSES,
  type PropertyStatus,
  type PropertySummary,
} from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Select } from "../../components/ui/Select";
import { SearchField } from "../../components/ui/SearchField";
import { SmartEmptyState } from "../../components/ui/SmartEmptyState";
import { NewPropertyChooser } from "./NewPropertyChooser";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Pagination } from "../../components/ui/Pagination";
import { ApiError } from "../../lib/http";
import { useDebounced } from "../../lib/useDebounced";
import {
  AVAILABLE_STATUS_ACTIONS,
  changePropertyStatus,
  deleteProperty,
  fetchProperties,
  type PropertyFilters,
} from "./api";
import { SendToLeadModal } from "../sharing/SendToLeadModal";
import { SelectLeadForSelectionModal } from "../selections/SelectLeadForSelectionModal";
import { usePageAction, usePageActionBar } from "../shell/ShellContext";
import { AuthImage } from "./AuthImage";
import {
  CATEGORY_LABELS,
  ORIGIN_LABELS,
  PURPOSE_LABELS,
  SORT_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  formatCode,
  mainPrice,
} from "./labels";

const PER_PAGE_OPTIONS = [10, 25, 50];

/** Teto do servidor por seleção: avisar antes é melhor que recusar no fim. */
const MAX_SELECIONADOS = 30;

/**
 * A carteira privada do corretor, em lista compacta estilo tabela: miniatura,
 * dados essenciais e ações rápidas em cada linha.
 *
 * Pensada para carteira grande: a lista é paginada no servidor, a posição fica
 * sempre à vista ("11–20 de 85"), os filtros ativos aparecem como marcadores
 * que se removem um a um, e a paginação numerada deixa saltar direto para
 * qualquer página em vez de avançar de dez em dez.
 */
export function PropertiesPage() {
  const queryClient = useQueryClient();
  // A carteira é o lugar de cadastrar imóvel, então a ação nasce aqui. Ela
  // abre a escolha entre importar por link e preencher à mão.
  const [chooserOpen, setChooserOpen] = useState(false);
  usePageAction("Cadastrar imóvel", () => setChooserOpen(true));
  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const [sort, setSort] = useState("recentes");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);
  const [showFilters, setShowFilters] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PropertySummary | null>(null);
  const [toSend, setToSend] = useState<PropertySummary | null>(null);

  // Modo de seleção: o corretor marca imóveis da carteira e envia como uma
  // seleção para a lead. A ordem de marcação vira a ordem dos itens.
  const [selectMode, setSelectMode] = useState(false);
  const [marked, setMarked] = useState<string[]>([]);
  const [pickerIds, setPickerIds] = useState<string[] | null>(null);
  // A marcação atravessa as páginas: o corretor pode montar uma seleção com
  // imóveis que estão em páginas diferentes. O teto do servidor é respeitado
  // aqui para ele não descobrir o limite só na hora de enviar.
  const toggleMarked = (id: string) =>
    setMarked((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= MAX_SELECIONADOS) return prev;
      return [...prev, id];
    });
  const noLimite = marked.length >= MAX_SELECIONADOS;
  const exitSelectMode = () => {
    setSelectMode(false);
    setMarked([]);
  };

  // A barra fixa de baixo existe só no modo de seleção; o layout tira o
  // balão de ajuda da frente enquanto ela estiver visível.
  usePageActionBar(selectMode);

  // Busca ao vivo: o campo responde na hora e a chamada sai quando a digitação
  // para. Termo novo sempre volta para a primeira página.
  const debouncedQ = useDebounced(q.trim());
  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const filters: PropertyFilters = {
    q: debouncedQ || undefined,
    purpose: purpose || undefined,
    category: category || undefined,
    status: status || undefined,
    origin: origin || undefined,
    sort,
    page,
    perPage,
  };

  const query = useQuery({
    queryKey: ["properties", filters],
    queryFn: () => fetchProperties(filters),
    placeholderData: keepPreviousData,
  });

  // Trocar de página tem que recomeçar a leitura do topo. Sem isso o corretor
  // clica no rodapé e continua olhando o rodapé, agora de outra página.
  const irParaPagina = (proxima: number) => {
    setPage(proxima);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // O conjunto pode encolher debaixo dos pés (uma exclusão na última página,
  // por exemplo). Sem isto sobraria uma página vazia sem explicação.
  const ultimaPagina = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.perPage))
    : 1;
  useEffect(() => {
    if (page > ultimaPagina) setPage(ultimaPagina);
  }, [page, ultimaPagina]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["properties"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: PropertyStatus }) =>
      changePropertyStatus(id, { status: next }),
    onSuccess: () => {
      invalidate();
      setActionError(null);
    },
    onError: (e) =>
      setActionError(
        e instanceof ApiError && e.status !== 500
          ? e.message
          : "Não foi possível mudar o status agora.",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProperty(id),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
    },
    onError: () => {
      setToDelete(null);
      setActionError("Não foi possível excluir agora. Tente novamente.");
    },
  });

  const hasFilters = Boolean(debouncedQ || purpose || category || status || origin);
  const activeFilters = [purpose, category, status, origin].filter(Boolean).length;
  const resetPage = () => setPage(1);

  // Filtro ativo vira marcador visível e removível: um número no botão diz
  // quantos são, mas não diz quais, e é isso que faz o corretor duvidar do
  // que está vendo.
  const chips = [
    purpose && { key: "purpose", label: PURPOSE_LABELS[purpose as never], clear: () => setPurpose("") },
    category && { key: "category", label: CATEGORY_LABELS[category as never], clear: () => setCategory("") },
    status && { key: "status", label: STATUS_LABELS[status as never], clear: () => setStatus("") },
    origin && { key: "origin", label: ORIGIN_LABELS[origin as never], clear: () => setOrigin("") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const limparTudo = () => {
    setQ("");
    setPurpose("");
    setCategory("");
    setStatus("");
    setOrigin("");
    resetPage();
  };

  if (query.isPending) return <PropertiesSkeleton />;

  if (query.isError) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Banner variant="danger">
          Não foi possível carregar seus imóveis. Verifique a conexão e tente novamente.
        </Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // O servidor devolve o perPage que aplicou; a paginação segue ele, não o
  // estado local, para não descrever uma página diferente da que chegou.
  const { items, total, perPage: perPageAplicado } = query.data;
  const totalPages = Math.max(1, Math.ceil(total / perPageAplicado));
  const primeiroDaPagina = total === 0 ? 0 : (page - 1) * perPageAplicado + 1;
  const ultimoDaPagina = Math.min(page * perPageAplicado, total);

  if (total === 0 && !hasFilters) {
    return (
      <>
        <SmartEmptyState
          icon={<HouseIcon className="h-8 w-8" />}
          title="Sua carteira de imóveis"
          description="Com imóveis cadastrados, você seleciona os certos para cada lead e envia num link exclusivo. Comece pelo essencial: fotos e detalhes entram depois."
          action={{ label: "Cadastrar primeiro imóvel", onClick: () => setChooserOpen(true) }}
        />
        <NewPropertyChooser open={chooserOpen} onClose={() => setChooserOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
        {/* Sem botão "Buscar": a lista responde enquanto digita, igual em Leads
            e Clientes. Imóveis mantém o painel porque filtra por cinco campos,
            o que não cabe em chips. */}
        {/* No celular a busca fica com a linha inteira: campo espremido não
            deixa ler o que se digitou nem o que se procura. Filtro e ordenação
            descem para a linha de baixo, onde sobra espaço para os dois. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:flex-1">
            <SearchField
              label="Buscar imóvel por título, código ou endereço"
              // A lupa já diz que é busca; o texto usa o espaço para dizer o
              // que dá para procurar, sem cortar no meio no celular.
              placeholder="Título, código ou endereço"
              value={q}
              onChange={setQ}
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Filtros
            {activeFilters > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-caption font-bold text-accent-on">
                {activeFilters}
              </span>
            )}
          </Button>

          {/* Ordenação junto do filtro: são os dois controles que moldam a
              lista. A contagem fica livre para dizer só onde você está. */}
          <Select
            label="Ordenar por"
            hideLabel
            compact
            align="right"
            value={sort}
            options={PROPERTY_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
            onValueChange={(v) => {
              setSort(v);
              resetPage();
            }}
            className="min-w-0 flex-1 sm:flex-none"
          />
        </div>

        {showFilters && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Finalidade"
              value={purpose}
              placeholder="Todas"
              options={PROPERTY_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
              onValueChange={(v) => {
                setPurpose(v);
                resetPage();
              }}
            />
            <Select
              label="Categoria"
              value={category}
              placeholder="Todas"
              options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              onValueChange={(v) => {
                setCategory(v);
                resetPage();
              }}
            />
            <Select
              label="Status"
              value={status}
              placeholder="Todos, menos arquivados"
              options={PROPERTY_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              onValueChange={(v) => {
                setStatus(v);
                resetPage();
              }}
            />
            <Select
              label="Origem"
              value={origin}
              placeholder="Todas"
              options={PROPERTY_ORIGINS.map((o) => ({ value: o, label: ORIGIN_LABELS[o] }))}
              onValueChange={(v) => {
                setOrigin(v);
                resetPage();
              }}
            />
          </div>
        )}

        {/* Filtros ativos, um a um, removíveis. Ordenação não entra aqui: ela
            não reduz a lista, só reorganiza, e mora ao lado da contagem. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={`Remover filtro ${chip.label}`}
                onClick={() => {
                  chip.clear();
                  resetPage();
                }}
                className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-3 pr-2 text-caption font-semibold text-accent transition-colors duration-fast hover:bg-accent hover:text-accent-on"
              >
                {chip.label}
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            ))}
            <button
              type="button"
              onClick={limparTudo}
              className="px-1 text-caption font-semibold text-text-muted underline underline-offset-2 transition-colors hover:text-text"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {actionError && <Banner variant="danger">{actionError}</Banner>}

      {total === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm">
          <h2 className="text-h3 text-text">Nada encontrado com esses filtros</h2>
          <p className="mt-2 max-w-sm text-body-sm text-text-muted">
            Ajuste a busca ou limpe os filtros para ver toda a carteira.
          </p>
          <Button type="button" variant="ghost" className="mt-5" onClick={limparTudo}>
            Limpar filtros
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-1">
              {/* Onde estou dentro do conjunto: com carteira grande, o total
                  sozinho não localiza ninguém. */}
              <p className="min-w-0 flex-1 truncate text-body-sm text-text-muted">
                <span className="font-semibold tabular-nums text-text">
                  {primeiroDaPagina}–{ultimoDaPagina}
                </span>{" "}
                de <span className="tabular-nums">{total}</span>{" "}
                {total === 1 ? "imóvel" : "imóveis"}
              </p>

              {/* Liga o modo de seleção: marcar imóveis e enviar para uma lead. */}
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                className="shrink-0 text-body-sm font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                {selectMode ? "Cancelar" : "Selecionar"}
              </button>
            </div>
            <ul className="animate-rise divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
              {items.map((property) => (
                <PropertyRow
                  key={property.id}
                  property={property}
                  selectMode={selectMode}
                  marked={marked.includes(property.id)}
                  noLimite={noLimite}
                  onToggleMark={() => toggleMarked(property.id)}
                  onChangeStatus={(next) =>
                    statusMutation.mutate({ id: property.id, status: next })
                  }
                  onDelete={() => setToDelete(property)}
                  onSend={() => setToSend(property)}
                />
              ))}
            </ul>
          </div>

          {(totalPages > 1 || total > PER_PAGE_OPTIONS[0]) && (
            <div className="flex flex-col items-center gap-3 pt-1">
              <Pagination page={page} totalPages={totalPages} onChange={irParaPagina} />

              {/* Quantos cabem de uma vez. No celular a lista já é rolagem
                  natural, então a escolha aparece só onde há tela para isso. */}
              <div className="hidden items-center gap-2 sm:flex">
                <span className="text-caption text-text-muted">Imóveis por página</span>
                <Select
                  label="Imóveis por página"
                  hideLabel
                  compact
                  align="right"
                  value={String(perPage)}
                  options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                  onValueChange={(v) => {
                    setPerPage(Number(v));
                    setPage(1);
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Excluir imóvel"
        description={
          toDelete
            ? `Excluir ${formatCode(toDelete.code)} · ${toDelete.title}? Fotos e vídeos serão apagados. Essa ação não pode ser desfeita. Se quiser só tirar da carteira ativa, prefira arquivar.`
            : ""
        }
        confirmLabel="Excluir definitivamente"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />

      <SendToLeadModal property={toSend} onClose={() => setToSend(null)} />

      {/* Barra do modo de seleção: contagem e o próximo passo, sempre à mão. */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-body-sm text-text-muted">
              {marked.length === 0 ? (
                <>
                  <span className="sm:hidden">Toque para marcar</span>
                  <span className="hidden sm:inline">Toque nos imóveis para marcar</span>
                </>
              ) : noLimite ? (
                // No limite a explicação aparece em qualquer tela: sem ela, as
                // linhas apagadas viram um toque que "não funciona".
                <span className="font-semibold text-text">
                  <span className="sm:hidden">Máximo de {MAX_SELECIONADOS} atingido</span>
                  <span className="hidden sm:inline">
                    {MAX_SELECIONADOS} selecionados
                    <span className="font-normal text-text-muted"> · máximo por seleção</span>
                  </span>
                </span>
              ) : (
                <>
                  <span className="tabular-nums">{marked.length}</span>{" "}
                  {marked.length === 1 ? "selecionado" : "selecionados"}
                </>
              )}
            </p>
            <Button
              type="button"
              className="shrink-0 whitespace-nowrap"
              disabled={marked.length === 0}
              onClick={() => setPickerIds(marked)}
            >
              Enviar para lead
            </Button>
          </div>
        </div>
      )}

      <SelectLeadForSelectionModal propertyIds={pickerIds} onClose={() => setPickerIds(null)} />
      <NewPropertyChooser open={chooserOpen} onClose={() => setChooserOpen(false)} />
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  success: "bg-[var(--success-soft)] text-[var(--success-fg)]",
  accent: "bg-accent-soft text-accent",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-fg)]",
  neutral: "bg-surface-sunken text-text-muted",
};

function PropertyRow({
  property,
  selectMode,
  marked,
  noLimite,
  onToggleMark,
  onChangeStatus,
  onDelete,
  onSend,
}: {
  property: PropertySummary;
  selectMode: boolean;
  marked: boolean;
  /** Teto de imóveis por seleção atingido: o que não está marcado trava. */
  noLimite: boolean;
  onToggleMark: () => void;
  onChangeStatus: (status: PropertyStatus) => void;
  onDelete: () => void;
  onSend: () => void;
}) {
  const navigate = useNavigate();
  const specs = [
    property.bedrooms != null && `${property.bedrooms} qtos`,
    property.parkingSpots != null && `${property.parkingSpots} vagas`,
    property.mainArea != null && `${property.mainArea} m²`,
  ].filter(Boolean) as string[];
  const location = [property.neighborhood, property.city].filter(Boolean).join(", ");
  // Arquivado não entra em seleção (mesma regra da API); no limite, só dá para
  // desmarcar o que já está marcado.
  const selecionavel = property.status !== "arquivado" && (marked || !noLimite);
  // No modo de seleção o toque MARCA, não navega: um modo, um gesto.
  const open = () => {
    if (selectMode) {
      if (selecionavel) onToggleMark();
      return;
    }
    navigate(`/imoveis/${property.id}`);
  };

  return (
    <li
      className={`flex items-center gap-3 px-3 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-sunken sm:gap-4 sm:px-4 ${
        selectMode && marked ? "bg-accent-soft/40" : ""
      } ${selectMode && !selecionavel ? "opacity-50" : ""}`}
    >
      {/* Marcador do modo de seleção, no padrão de listas de apps. */}
      {selectMode && (
        <button
          type="button"
          role="checkbox"
          aria-checked={marked}
          aria-label={`${marked ? "Desmarcar" : "Marcar"} ${property.title}`}
          disabled={!selecionavel}
          title={
            selecionavel
              ? undefined
              : property.status === "arquivado"
                ? "Imóvel arquivado não entra em seleção"
                : `Máximo de ${MAX_SELECIONADOS} imóveis por seleção`
          }
          onClick={onToggleMark}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-fast ${
            marked ? "border-accent bg-accent text-accent-on" : "border-border-strong bg-surface"
          }`}
        >
          {marked && (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}
      {/* Miniatura pequena, clicável. */}
      <button
        type="button"
        onClick={open}
        aria-label={`Ver ${property.title}`}
        className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken sm:h-16 sm:w-24"
      >
        {property.coverUrl ? (
          <AuthImage src={property.coverUrl} alt={property.title} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-text-subtle">
            <HouseIcon className="h-6 w-6" />
          </span>
        )}
      </button>

      {/* Dados essenciais: a linha toda leva à ficha. */}
      <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
        {/* No celular a finalidade sai da chapéu: o preço já a entrega, pelo
            "/mês" da locação. A partir de sm ela volta. */}
        <p className="truncate text-caption font-semibold uppercase tracking-wide text-text-subtle">
          {formatCode(property.code)} · {TYPE_LABELS[property.type] ?? property.type}
          <span className="hidden sm:inline"> · {PURPOSE_LABELS[property.purpose]}</span>
        </p>
        <span className="mt-0.5 flex items-center gap-2">
          {/* Nome cortado no meio não identifica imóvel nenhum: no celular ele
              usa duas linhas em vez de perder o fim. */}
          <span className="line-clamp-2 text-body font-semibold text-text sm:line-clamp-1">
            {property.title}
          </span>
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold sm:inline ${TONE_CLASSES[STATUS_TONES[property.status]]}`}
          >
            {STATUS_LABELS[property.status]}
          </span>
        </span>
        {/* Metragem e quartos só onde cabem inteiros; no celular fica o lugar,
            que é o que separa um imóvel do outro na varredura. */}
        <p className="mt-0.5 truncate text-body-sm text-text-muted">
          <span className="sm:hidden">{location}</span>
          <span className="hidden sm:inline">
            {[location, specs.join(" · ")].filter(Boolean).join(" · ")}
          </span>
        </p>
        {/* No mobile o status vem junto do preço. */}
        <span className="mt-1 flex items-center gap-2 sm:hidden">
          <span className="text-body-sm font-bold text-text">{mainPrice(property)}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-caption font-semibold ${TONE_CLASSES[STATUS_TONES[property.status]]}`}
          >
            {STATUS_LABELS[property.status]}
          </span>
        </span>
      </button>

      {/* Valor no desktop. */}
      <p className="hidden shrink-0 text-right text-body font-bold tabular-nums text-text sm:block sm:w-32">
        {mainPrice(property)}
      </p>

      {/* Ações rápidas (fora do modo de seleção, para não disputar o toque). */}
      <div className={`shrink-0 items-center gap-1.5 ${selectMode ? "hidden" : "flex"}`}>
        <Button
          type="button"
          variant="ghost"
          className="hidden min-h-[38px] px-3 text-body-sm lg:inline-flex"
          onClick={open}
        >
          Ver
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="hidden min-h-[38px] px-3 text-body-sm lg:inline-flex"
          onClick={() => navigate(`/imoveis/${property.id}/editar`)}
        >
          Editar
        </Button>
        <RowMenu
          property={property}
          onChangeStatus={onChangeStatus}
          onDelete={onDelete}
          onSend={onSend}
        />
      </div>
    </li>
  );
}

/** Menu contextual da linha: ver/editar (mobile), status rápidos e excluir. */
function RowMenu({
  property,
  onChangeStatus,
  onDelete,
  onSend,
}: {
  property: PropertySummary;
  onChangeStatus: (status: PropertyStatus) => void;
  onDelete: () => void;
  onSend: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const item = "block w-full px-4 py-2.5 text-left text-body-sm text-text hover:bg-surface-sunken";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Ações de ${property.title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md">
          <button type="button" className={`${item} lg:hidden`} onClick={() => navigate(`/imoveis/${property.id}`)}>
            Ver ficha
          </button>
          <button
            type="button"
            className={`${item} lg:hidden`}
            onClick={() => navigate(`/imoveis/${property.id}/editar`)}
          >
            Editar
          </button>
          <div className="my-1 border-t border-border lg:hidden" />
          <button
            type="button"
            className={`${item} font-semibold text-accent`}
            onClick={() => {
              setOpen(false);
              onSend();
            }}
          >
            Enviar para uma lead
          </button>
          <div className="my-1 border-t border-border" />
          {AVAILABLE_STATUS_ACTIONS.filter((a) => a.status !== property.status).map((action) => (
            <button
              key={action.status}
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onChangeStatus(action.status);
              }}
            >
              {action.label}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className={`${item} font-semibold text-[var(--danger-fg)]`}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Excluir imóvel
          </button>
        </div>
      )}
    </div>
  );
}

function HouseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PropertiesSkeleton() {
  return (
    <div role="status" aria-label="Carregando imóveis" className="flex flex-col gap-4">
      <div className="h-5 w-56 animate-pulse rounded bg-surface-sunken" />
      <div className="h-16 animate-pulse rounded-xl bg-surface-sunken" />
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-16 w-24 animate-pulse rounded-lg bg-surface-sunken" />
            <div className="flex-1">
              <div className="h-3.5 w-40 animate-pulse rounded bg-surface-sunken" />
              <div className="mt-2 h-4 w-64 animate-pulse rounded bg-surface-sunken" />
              <div className="mt-2 h-3.5 w-48 animate-pulse rounded bg-surface-sunken" />
            </div>
            <div className="h-4 w-24 animate-pulse rounded bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
