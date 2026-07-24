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
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
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

const PER_PAGE = 10;

/**
 * A carteira privada do corretor, em lista compacta estilo tabela: miniatura,
 * dados essenciais e ações rápidas em cada linha. 10 por página.
 */
export function PropertiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const [sort, setSort] = useState("recentes");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PropertySummary | null>(null);
  const [toSend, setToSend] = useState<PropertySummary | null>(null);

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
    perPage: PER_PAGE,
  };

  const query = useQuery({
    queryKey: ["properties", filters],
    queryFn: () => fetchProperties(filters),
    placeholderData: keepPreviousData,
  });

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

  const { items, total, perPage } = query.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (total === 0 && !hasFilters) {
    return (
      <SmartEmptyState
        icon={<HouseIcon className="h-8 w-8" />}
        title="Sua carteira de imóveis"
        description="Com imóveis cadastrados, você seleciona os certos para cada lead e envia num link exclusivo. Comece pelo essencial: fotos e detalhes entram depois."
        action={{ label: "Cadastrar primeiro imóvel", onClick: () => navigate("/imoveis/novo") }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
        {/* Sem botão "Buscar": a lista responde enquanto digita, igual em Leads
            e Clientes. Imóveis mantém o painel porque filtra por cinco campos,
            o que não cabe em chips. */}
        <div className="flex gap-2">
          <SearchField
            label="Buscar imóvel por título, código ou endereço"
            placeholder="Buscar por título, código ou endereço"
            value={q}
            onChange={setQ}
          />
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
        </div>

        {showFilters && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              label="Finalidade"
              value={purpose}
              placeholder="Todas"
              options={PROPERTY_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
              onChange={(e) => {
                setPurpose(e.target.value);
                resetPage();
              }}
            />
            <Select
              label="Categoria"
              value={category}
              placeholder="Todas"
              options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
              onChange={(e) => {
                setCategory(e.target.value);
                resetPage();
              }}
            />
            <Select
              label="Status"
              value={status}
              placeholder="Todos, menos arquivados"
              options={PROPERTY_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              onChange={(e) => {
                setStatus(e.target.value);
                resetPage();
              }}
            />
            <Select
              label="Origem"
              value={origin}
              placeholder="Todas"
              options={PROPERTY_ORIGINS.map((o) => ({ value: o, label: ORIGIN_LABELS[o] }))}
              onChange={(e) => {
                setOrigin(e.target.value);
                resetPage();
              }}
            />
            <Select
              label="Ordenar por"
              value={sort}
              options={PROPERTY_SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
              onChange={(e) => {
                setSort(e.target.value);
                resetPage();
              }}
            />
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
          <Button
            type="button"
            variant="ghost"
            className="mt-5"
            onClick={() => {
              setQ("");
              setPurpose("");
              setCategory("");
              setStatus("");
              setOrigin("");
              resetPage();
            }}
          >
            Limpar filtros
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <p className="text-body-sm font-semibold text-text">
                {total === 1 ? "1 imóvel" : `${total} imóveis`}
              </p>
              <p className="text-caption text-text-subtle">de qualquer origem</p>
            </div>
            <ul className="animate-rise divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
              {items.map((property) => (
                <PropertyRow
                  key={property.id}
                  property={property}
                  onChangeStatus={(next) =>
                    statusMutation.mutate({ id: property.id, status: next })
                  }
                  onDelete={() => setToDelete(property)}
                  onSend={() => setToSend(property)}
                />
              ))}
            </ul>
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 pt-1" aria-label="Paginação">
              <Button
                type="button"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-body-sm tabular-nums text-text-muted">
                Página {page} de {totalPages}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </nav>
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
  const specs = [
    property.bedrooms != null && `${property.bedrooms} qtos`,
    property.parkingSpots != null && `${property.parkingSpots} vagas`,
    property.mainArea != null && `${property.mainArea} m²`,
  ].filter(Boolean) as string[];
  const location = [property.neighborhood, property.city].filter(Boolean).join(", ");
  const open = () => navigate(`/imoveis/${property.id}`);

  return (
    <li className="flex items-center gap-3 px-3 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-sunken sm:gap-4 sm:px-4">
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
        <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
          {formatCode(property.code)} · {TYPE_LABELS[property.type] ?? property.type} ·{" "}
          {PURPOSE_LABELS[property.purpose]}
        </p>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="truncate text-body font-semibold text-text">{property.title}</span>
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold sm:inline ${TONE_CLASSES[STATUS_TONES[property.status]]}`}
          >
            {STATUS_LABELS[property.status]}
          </span>
        </span>
        <p className="mt-0.5 truncate text-body-sm text-text-muted">
          {[location, specs.join(" · ")].filter(Boolean).join(" · ")}
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

      {/* Ações rápidas. */}
      <div className="flex shrink-0 items-center gap-1.5">
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
